/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    type Bytes,
    type CloneableStorage,
    type DataNamespace,
    FilesystemStorageDriver,
    fromJson,
    NoProviderError,
    type StorageDriver,
    StorageTransaction,
    type SupportedStorageTypes,
    toJson,
} from "@matter/general";
import { resolve } from "node:path";

import { isBunjs, supportsSqlite } from "#util/runtimeChecks.js";
import { SqliteStorageDriverError } from "./SqliteStorageDriverError.js";
import type { DatabaseCreator, DatabaseLike, SafeUint8Array, SqlRunnable } from "./SqliteTypes.js";
import { SqliteTransaction as Transaction } from "./SqliteTypes.js";
import { buildContextKeyLog, buildContextKeyPair, buildContextPath, escapeGlob } from "./SqliteUtil.js";

/**
 * Type of Key-Value store table
 *
 * T means JSON or BLOB type
 */
type KVStoreType<T extends string | SafeUint8Array = string | SafeUint8Array> = {
    context: string;
    key: string;
    value_type: T extends string ? "json" : "blob";
    value_json: T extends string ? string : null;
    value_blob: T extends SafeUint8Array ? SafeUint8Array : null;
};

/**
 * SQLRunnable with
 *
 * `I`: keyof KVStoreType -> KVStoreType
 * `O`: keyof KVStoreType -> KVStoreType
 */
type SqlRunnableKV<
    I extends keyof KVStoreType<string> | void,
    O extends keyof KVStoreType<string> | void,
> = SqlRunnable<
    I extends keyof KVStoreType<string> ? Pick<KVStoreType<string>, I> : void,
    O extends keyof KVStoreType<string> ? Pick<KVStoreType<string>, O> : void
>;

/**
 * SQLite implementation of `FileStorageDriver.ts`
 *
 * `DatabaseCreator` is need to use (sqlite).
 *
 * Supports `node:sqlite`, `bun:sqlite`. (maybe also `better-sqlite3` support)
 */
export class SqliteStorageDriver extends FilesystemStorageDriver implements CloneableStorage {
    static readonly id = "sqlite";
    public static readonly memoryPath = ":memory:";
    public static readonly defaultTableName = "kvstore";

    /**
     * Create a SqliteStorageDriver for the given namespace using the platform-appropriate database.
     */
    static async create(namespace: DataNamespace) {
        const storage = new SqliteStorageDriver({ namespaceOrPath: namespace });
        await storage.initialize();
        return storage;
    }

    protected isInitialized = false;
    #inTransaction = false;

    // internal values
    #database!: DatabaseLike;
    #databaseCreator?: DatabaseCreator;
    protected readonly dbPath: string;
    protected readonly tableName: string;
    protected readonly clearOnInit: boolean;

    // queries
    #queryGet!: SqlRunnableKV<"context" | "key", "value_json">;
    #queryGetRaw!: SqlRunnable<void, KVStoreType>;
    #querySet!: SqlRunnableKV<"context" | "key" | "value_json", void>;
    #querySetRaw!: SqlRunnable<KVStoreType, void>;
    #queryDelete!: SqlRunnableKV<"context" | "key", void>;
    #queryKeys!: SqlRunnableKV<"context", "key">;
    #queryValues!: SqlRunnable<{ context: string }, { key: string; value_json: string }>;
    #queryContextSub!: SqlRunnable<{ contextGlob: string }, { context: string }>;
    #queryClearAll!: SqlRunnable<{ context: string; contextGlob: string }, void>;
    #queryHas!: SqlRunnable<{ context: string; key: string }, { has_record: 1 }>;
    #queryOpenBlob!: SqlRunnable<
        Pick<KVStoreType, "context" | "key">,
        Pick<KVStoreType, "value_type" | "value_json" | "value_blob">
    >;
    #queryWriteBlob!: SqlRunnable<Pick<KVStoreType, "context" | "key" | "value_blob">, void>;

    /**
     * Create sqlite-based disk storage.
     *
     * @param args.databaseCreator Optional database instance creator.  If omitted, resolved automatically during
     *   {@link initialize} via platform detection.
     * @param args.namespaceOrPath DataNamespace (derives path from root directory), string (direct path), or
     *   null/undefined for in-memory database
     * @param args.clear Clear on init
     * @param args.tableName table name
     */
    constructor(args?: {
        databaseCreator?: DatabaseCreator;
        namespaceOrPath?: DataNamespace | string | null;
        tableName?: string;
        clear?: boolean;
    }) {
        const namespaceOrPath = args?.namespaceOrPath;
        super(typeof namespaceOrPath === "string" || namespaceOrPath == null ? undefined : namespaceOrPath);

        this.dbPath =
            typeof namespaceOrPath === "string"
                ? namespaceOrPath
                : namespaceOrPath != null
                  ? resolve(this.root!.directory.path, "storage.db")
                  : SqliteStorageDriver.memoryPath;

        // tableName is vulnerable — DO NOT USE FROM USER'S INPUT
        this.tableName = args?.tableName ?? SqliteStorageDriver.defaultTableName;
        this.clearOnInit = args?.clear ?? false;

        if (args?.databaseCreator) {
            this.#openDatabase(args.databaseCreator);
        }
    }

    #openDatabase(databaseCreator: DatabaseCreator) {
        this.#databaseCreator = databaseCreator;
        this.#database = databaseCreator(this.dbPath);

        // ═════════════════════════════════════════════════════════════
        // Query Preparation
        // ═════════════════════════════════════════════════════════════

        // Schema Initialization
        const initQuery = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        context TEXT NOT NULL,
        key TEXT NOT NULL,
        value_type TEXT CHECK(value_type IN ('json', 'blob')),
        value_json TEXT,
        value_blob BLOB,
        CONSTRAINT PKPair PRIMARY KEY (context, key)
      ) STRICT
    `);
        initQuery.run(); // Run once (prepare requires existing database in bun.js)

        // Read Operations
        this.#queryGet = this.#database.prepare(`
      SELECT value_json FROM ${this.tableName} WHERE
        context=$context AND
        key=$key AND
        value_type='json'
    `);

        this.#queryGetRaw = this.#database.prepare(`
      SELECT * FROM ${this.tableName}
    `);

        this.#queryHas = this.#database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM ${this.tableName}
        WHERE context=$context AND key=$key
      ) as has_record
    `);

        // Write Operations
        this.#querySet = this.#database.prepare(`
      INSERT INTO ${this.tableName}
        (context, key, value_type, value_json, value_blob)
      VALUES($context, $key, 'json', $value_json, NULL)
      ON CONFLICT(context, key)
      DO UPDATE SET
        value_type = 'json',
        value_json = excluded.value_json,
        value_blob = NULL
    `);

        this.#querySetRaw = this.#database.prepare(`
      INSERT INTO ${this.tableName}
        (context, key, value_type, value_json, value_blob)
      VALUES($context, $key, $value_type, $value_json, $value_blob)
      ON CONFLICT(context, key)
      DO UPDATE SET
        value_type = excluded.value_type,
        value_json = excluded.value_json,
        value_blob = excluded.value_blob
    `);

        // Delete Operations
        this.#queryDelete = this.#database.prepare(`
      DELETE FROM ${this.tableName} WHERE
        context=$context AND
        key=$key
    `);

        this.#queryClearAll = this.#database.prepare(`
      DELETE FROM ${this.tableName} WHERE
        context=$context OR context GLOB $contextGlob
    `);

        // Context & Key Queries
        this.#queryKeys = this.#database.prepare(`
      SELECT DISTINCT key FROM ${this.tableName} WHERE
        context=$context
    `);

        this.#queryValues = this.#database.prepare(`
      SELECT key, value_json FROM ${this.tableName} WHERE
        context=$context AND
        value_type='json'
    `);

        this.#queryContextSub = this.#database.prepare(`
      SELECT DISTINCT context FROM ${this.tableName} WHERE
        context GLOB $contextGlob
    `);

        // Blob Operations
        this.#queryOpenBlob = this.#database.prepare(`
      SELECT value_type, value_json, value_blob FROM ${this.tableName} WHERE
        context=$context AND
        key=$key
    `);

        this.#queryWriteBlob = this.#database.prepare(`
      INSERT INTO ${this.tableName}
        (context, key, value_type, value_json, value_blob)
      VALUES($context, $key, 'blob', NULL, $value_blob)
      ON CONFLICT(context, key)
      DO UPDATE SET
        value_type = 'blob',
        value_json = NULL,
        value_blob = excluded.value_blob
    `);
    }

    /**
     * Manual transaction control
     *
     * Use this for explicit transaction management across multiple operations.
     * Internal methods like `set()` will automatically detect and use external transactions.
     *
     * TODO: Sync transaction to native matter.js API
     */
    public transaction(mode: Transaction) {
        switch (mode) {
            case Transaction.BEGIN:
                if (this.#inTransaction) {
                    throw new SqliteStorageDriverError("transaction", "BEGIN", "Transaction is in progress.");
                }
                this.#database.exec("BEGIN IMMEDIATE TRANSACTION");
                this.#inTransaction = true;
                break;

            case Transaction.COMMIT:
                if (!this.#inTransaction) {
                    throw new SqliteStorageDriverError("transaction", "COMMIT", "No transaction in progress.");
                }
                this.#database.exec("COMMIT");
                this.#inTransaction = false;
                break;

            case Transaction.ROLLBACK:
                if (!this.#inTransaction) {
                    return;
                }
                this.#database.exec("ROLLBACK");
                this.#inTransaction = false;
                break;
        }
    }

    protected withAnyTransaction<T>(callback: () => T) {
        if (this.#inTransaction) {
            // Use external transaction
            return callback();
        }
        // Use internal transaction
        this.transaction(Transaction.BEGIN);
        try {
            const result = callback();
            this.transaction(Transaction.COMMIT);
            return result;
        } catch (err) {
            this.transaction(Transaction.ROLLBACK);
            throw err;
        }
    }

    override get initialized() {
        return this.isInitialized;
    }

    override async initialize(): Promise<void> {
        if (this.isInitialized) {
            throw new SqliteStorageDriverError("initialize", this.tableName, "Storage already initialized!");
        }
        if (!this.#databaseCreator) {
            this.#openDatabase(await platformDatabaseCreator());
        }
        await super.initialize();
        if (this.clearOnInit) {
            this.#database.prepare(`DELETE FROM ${this.tableName}`).run();
        }
        this.isInitialized = true;
    }

    public clone(): StorageDriver {
        const clonedStorage = new SqliteStorageDriver({
            databaseCreator: this.#databaseCreator,
            namespaceOrPath: null,
            tableName: this.tableName,
            clear: false,
        });

        const rawData = this.getRawAll();
        clonedStorage.setRaw(rawData);
        clonedStorage.isInitialized = true;
        return clonedStorage;
    }

    override async close() {
        this.isInitialized = false;
        this.#database.close();
        await super.close();
    }

    override get<T extends SupportedStorageTypes>(contexts: string[], key: string): T | null | undefined {
        const queryResult = this.#queryGet.get(buildContextKeyPair(contexts, key));
        // Bun returns null, NodeJs returns undefined
        if (queryResult == null) {
            return undefined;
        }
        if (queryResult.value_json === null) {
            // Shouldn't be happened. (Confused with BLOB?)
            this.delete(contexts, key);

            throw new SqliteStorageDriverError(
                "get",
                buildContextKeyLog(contexts, key),
                "path has null json-value! (expected non-null value)",
            );
        }

        return fromJson(queryResult.value_json) as T | null;
    }

    protected getRawAll() {
        return this.#queryGetRaw.all().filter(v => v != null);
    }

    override set(contexts: string[], key: string, value: SupportedStorageTypes): void;
    override set(contexts: string[], values: Record<string, SupportedStorageTypes>): void;
    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (typeof keyOrValues === "string") {
            if (value === undefined) {
                // If user called set(contexts, key),
                // indented behavior should be error instead of setting `undefined JSON`.
                throw new SqliteStorageDriverError(
                    "set",
                    buildContextKeyLog(contexts, keyOrValues),
                    "Use null instead of undefined if you want to store null value!",
                );
            }
            this.setValue(contexts, keyOrValues, toJson(value));
        } else {
            // use internal/external transaction
            this.withAnyTransaction(() => {
                for (const [key, value] of Object.entries(keyOrValues)) {
                    this.setValue(contexts, key, toJson(value ?? null));
                }
            });
        }
    }

    /**
     * Set [contexts, key] to value
     * @param contexts Context
     * @param key Key
     * @param value Value
     * @returns
     */
    protected setValue(contexts: string[], key: string, value: string) {
        const { changes } = this.#querySet.run({
            ...buildContextKeyPair(contexts, key),
            value_json: value,
        });
        if (Number(changes) <= 0) {
            throw new SqliteStorageDriverError(
                "set",
                buildContextKeyLog(contexts, key),
                `Something went wrong! Value wasn't changed.`,
            );
        }
    }

    /**
     * Set Raw data. (for copy)
     */
    protected setRaw(rawData: KVStoreType[]) {
        if (rawData.length <= 0) {
            return;
        }
        if (rawData.length === 1) {
            const raw = rawData[0];
            const { changes } = this.#querySetRaw.run({
                context: raw.context,
                key: raw.key,
                value_type: raw.value_type,
                value_json: raw.value_json,
                value_blob: raw.value_blob,
            });
            if (Number(changes) <= 0) {
                throw new SqliteStorageDriverError(
                    "setraw",
                    `${raw.context}$${raw.key}`,
                    `Something went wrong! Value wasn't changed.`,
                );
            }
            return;
        }

        this.withAnyTransaction(() => {
            for (const raw of rawData) {
                const { changes } = this.#querySetRaw.run({
                    context: raw.context,
                    key: raw.key,
                    value_type: raw.value_type,
                    value_json: raw.value_json,
                    value_blob: raw.value_blob,
                });
                if (Number(changes) <= 0) {
                    throw new SqliteStorageDriverError(
                        "setraw",
                        `${raw.context}$${raw.key}`,
                        `Something went wrong! Value wasn't changed.`,
                    );
                }
            }
        });
    }

    override delete(contexts: string[], key: string) {
        this.#queryDelete.run(buildContextKeyPair(contexts, key));
    }

    override keys(contexts: string[]) {
        const queryResults = this.#queryKeys
            .all({
                context: buildContextPath(contexts),
            })
            .filter(v => v != null);

        return queryResults.map(v => v.key);
    }

    override values(contexts: string[]) {
        const queryResults = this.#queryValues
            .all({
                context: buildContextPath(contexts),
            })
            .filter(v => v != null);

        const record = Object.create(null) as Record<string, SupportedStorageTypes>;

        for (const element of queryResults) {
            record[element.key] = fromJson(element.value_json);
        }

        return record;
    }

    /**
     * Return sub contexts of context
     * (search nested depth, return 1 depth of them)
     * @param contexts context path
     * @returns sub contexts
     */
    override contexts(contexts: string[]): string[] {
        const parentCtx = buildContextPath(contexts);
        let subContexts: string[];

        if (contexts.length === 0) {
            // Query all root contexts (may include nested ones)
            const allContexts = this.#queryContextSub.all({ contextGlob: "*" }).filter(v => v != null);

            subContexts = allContexts.map(v => {
                const firstDotIndex = v.context.indexOf(".");
                if (firstDotIndex < 0) {
                    // root
                    return v.context;
                }
                return v.context.substring(0, firstDotIndex);
            });
        } else {
            // Query all sub-contexts (may include deeply nested ones)
            const allSubContexts = this.#queryContextSub
                .all({
                    contextGlob: escapeGlob(parentCtx) + ".*",
                })
                .filter(v => v != null);

            subContexts = allSubContexts.map(v => {
                const subKey = v.context.substring(parentCtx.length + 1);
                const dotIndex = subKey.indexOf(".");

                if (dotIndex < 0) {
                    // direct child
                    return subKey;
                }
                return subKey.substring(0, dotIndex);
            });
        }

        // Remove duplicates and empty values
        return [...new Set(subContexts.filter(c => c != null && c.trim().length > 0))];
    }

    override clearAll(contexts: string[]) {
        // Match FileStorageDriver behavior: if contexts is empty, do nothing
        if (contexts.length === 0) {
            return;
        }
        const contextPath = buildContextPath(contexts);

        // Delete the context itself and all sub-contexts
        this.#queryClearAll.run({
            context: contextPath,
            contextGlob: escapeGlob(contextPath) + ".*",
        });
    }

    override has(contexts: string[], key: string) {
        const result = this.#queryHas.get(buildContextKeyPair(contexts, key));
        return result?.has_record === 1;
    }

    override openBlob(contexts: string[], key: string): Blob {
        const queryResult = this.#queryOpenBlob.get(buildContextKeyPair(contexts, key));
        if (queryResult == null) {
            return new Blob();
        }
        if (queryResult.value_type === "blob" && queryResult.value_blob != null) {
            return new Blob([new Uint8Array(queryResult.value_blob)]);
        }
        if (queryResult.value_type === "json" && queryResult.value_json != null) {
            return new Blob([queryResult.value_json]);
        }

        // Corrupted context$key
        this.delete(contexts, key);
        return new Blob();
    }

    override async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>) {
        const arrayBuffer = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const queryResult = this.#queryWriteBlob.run({
            ...buildContextKeyPair(contexts, key),
            value_blob: bytes,
        });
        if (Number(queryResult.changes) <= 0) {
            throw new SqliteStorageDriverError(
                "writeBlob",
                buildContextKeyLog(contexts, key),
                `Something went wrong! Value wasn't changed.`,
            );
        }
    }

    override begin(): StorageTransaction {
        return new SqliteStorageDriverTransaction(this);
    }
}

/**
 * Get the platform-appropriate SQLite database creator.
 *
 * Handles both ESM and CJS module formats via {@link findDefaultExport}.
 */
async function platformDatabaseCreator(): Promise<DatabaseCreator> {
    if (!supportsSqlite()) {
        throw new NoProviderError("SQLite requires Node.js 22+ or Bun");
    }

    if (isBunjs()) {
        const module = await import("./platform/BunSqlite.js");
        return findDefaultExport(module, "createBunDatabase");
    }

    const module = await import("./platform/NodeJsSqlite.js");
    return findDefaultExport(module, "createNodeJsDatabase");
}

/**
 * Find named export from dynamically imported module.
 *
 * Handles both ESM and CJS module formats when using `await import()`:
 *
 * - **ESM**: `{ ExportName: [value] }`
 * - **CJS (wrapped)**: `{ default: { ExportName: [value] } }`
 * - **CJS (direct)**: `{ default: [value] }`
 */
function findDefaultExport<T, N extends keyof T>(moduleLike: T, name: N): T[N] {
    return moduleLike[name] || (moduleLike as any).default?.[name] || (moduleLike as any).default;
}

class SqliteStorageDriverTransaction extends StorageTransaction {
    constructor(private readonly sqliteStorage: SqliteStorageDriver) {
        super(sqliteStorage);
        sqliteStorage.transaction(Transaction.BEGIN);
    }

    override commit() {
        this.assertActive();
        this.sqliteStorage.transaction(Transaction.COMMIT);
        super.commit();
    }

    protected override rollback() {
        this.sqliteStorage.transaction(Transaction.ROLLBACK);
    }
}
