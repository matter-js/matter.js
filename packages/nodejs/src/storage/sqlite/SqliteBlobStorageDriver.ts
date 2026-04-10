/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Bytes, type DataNamespace, DatafileRoot, FilesystemBlobStorageDriver } from "@matter/general";
import { resolve } from "node:path";

import { platformDatabaseCreator } from "./SqlitePlatform.js";
import { SqliteStorageDriverError } from "./SqliteStorageDriverError.js";
import type { DatabaseCreator, DatabaseLike, SafeUint8Array, SqlRunnable } from "./SqliteTypes.js";
import { buildContextKeyPair, buildContextPath, escapeGlob } from "./SqliteUtil.js";

/**
 * Type of blob store table row.
 */
type BlobStoreType = {
    context: string;
    key: string;
    data: SafeUint8Array;
};

/**
 * SQLite implementation of {@link BlobStorageDriver}.
 *
 * Uses a dedicated `blobstore` table (separate from the KV `kvstore` table)
 * but can share the same `.db` file.
 */
export class SqliteBlobStorageDriver extends FilesystemBlobStorageDriver {
    static readonly id = "sqlite";
    public static readonly memoryPath = ":memory:";
    public static readonly defaultTableName = "blobstore";

    /**
     * Create a SqliteBlobStorageDriver for the given namespace using the platform-appropriate database.
     */
    static async create(namespace: DataNamespace): Promise<SqliteBlobStorageDriver> {
        const storage = new SqliteBlobStorageDriver({ namespaceOrPath: namespace });
        await storage.initialize();
        return storage;
    }

    #isInitialized = false;

    #database!: DatabaseLike;
    #databaseCreator?: DatabaseCreator;
    readonly #dbPath: string;
    readonly #tableName: string;

    // Prepared queries
    #queryOpenBlob!: SqlRunnable<Pick<BlobStoreType, "context" | "key">, Pick<BlobStoreType, "data">>;
    #queryWriteBlob!: SqlRunnable<BlobStoreType, void>;
    #queryDeleteBlob!: SqlRunnable<Pick<BlobStoreType, "context" | "key">, void>;
    #queryHasBlob!: SqlRunnable<{ context: string; key: string }, { has_record: 1 }>;
    #queryKeysBlob!: SqlRunnable<{ context: string }, { key: string }>;
    #queryContextsSub!: SqlRunnable<{ contextGlob: string }, { context: string }>;
    #queryClearAll!: SqlRunnable<{ context: string; contextGlob: string }, void>;

    /**
     * Create sqlite-based blob storage.
     *
     * @param args.databaseCreator Optional database instance creator. If omitted, resolved automatically during
     *   {@link initialize} via platform detection.
     * @param args.namespaceOrPath DataNamespace (derives path from root directory), string (direct path), or
     *   null/undefined for in-memory database
     * @param args.tableName table name
     */
    constructor(args?: {
        databaseCreator?: DatabaseCreator;
        namespaceOrPath?: DataNamespace | string | null;
        tableName?: string;
    }) {
        const namespaceOrPath = args?.namespaceOrPath;
        // Pass DataNamespace for filesystem locking; string/null → no locking (e.g. :memory:)
        super(typeof namespaceOrPath === "string" || namespaceOrPath == null ? undefined : namespaceOrPath);

        this.#dbPath =
            typeof namespaceOrPath === "string"
                ? namespaceOrPath
                : namespaceOrPath instanceof DatafileRoot
                  ? resolve(namespaceOrPath.directory.path, "storage.db")
                  : SqliteBlobStorageDriver.memoryPath;

        this.#tableName = args?.tableName ?? SqliteBlobStorageDriver.defaultTableName;

        if (args?.databaseCreator) {
            this.#openDatabase(args.databaseCreator);
        }
    }

    #openDatabase(databaseCreator: DatabaseCreator) {
        this.#databaseCreator = databaseCreator;
        this.#database = databaseCreator(this.#dbPath);

        // Schema Initialization
        const initQuery = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${this.#tableName} (
        context TEXT NOT NULL,
        key TEXT NOT NULL,
        data BLOB,
        PRIMARY KEY (context, key)
      ) STRICT
    `);
        initQuery.run();

        // Read
        this.#queryOpenBlob = this.#database.prepare(`
      SELECT data FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key
    `);

        // Write (upsert)
        this.#queryWriteBlob = this.#database.prepare(`
      INSERT INTO ${this.#tableName}
        (context, key, data)
      VALUES($context, $key, $data)
      ON CONFLICT(context, key)
      DO UPDATE SET data = excluded.data
    `);

        // Delete single
        this.#queryDeleteBlob = this.#database.prepare(`
      DELETE FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key
    `);

        // Exists check
        this.#queryHasBlob = this.#database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM ${this.#tableName}
        WHERE context=$context AND key=$key
      ) as has_record
    `);

        // Keys for a context
        this.#queryKeysBlob = this.#database.prepare(`
      SELECT DISTINCT key FROM ${this.#tableName} WHERE
        context=$context
    `);

        // Sub-context discovery
        this.#queryContextsSub = this.#database.prepare(`
      SELECT DISTINCT context FROM ${this.#tableName} WHERE
        context GLOB $contextGlob
    `);

        // Clear context and all sub-contexts
        this.#queryClearAll = this.#database.prepare(`
      DELETE FROM ${this.#tableName} WHERE
        context=$context OR context GLOB $contextGlob
    `);
    }

    override get initialized() {
        return this.#isInitialized;
    }

    override async initialize(): Promise<void> {
        if (this.#isInitialized) {
            throw new SqliteStorageDriverError("initialize", this.#tableName, "Storage already initialized!");
        }
        await super.initialize();
        if (!this.#databaseCreator) {
            this.#openDatabase(await platformDatabaseCreator());
        }
        this.#isInitialized = true;
    }

    override async close() {
        this.#isInitialized = false;
        this.#database.close();
        await super.close();
    }

    override openBlob(contexts: string[], key: string): Blob {
        const queryResult = this.#queryOpenBlob.get(buildContextKeyPair(contexts, key));
        if (queryResult == null || queryResult.data == null) {
            return new Blob();
        }
        return new Blob([new Uint8Array(queryResult.data)]);
    }

    // SQLite does not support incremental blob writes — the full blob must be buffered before INSERT.
    override async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        const arrayBuffer = await new Response(stream).arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const queryResult = this.#queryWriteBlob.run({
            ...buildContextKeyPair(contexts, key),
            data: bytes,
        });
        if (Number(queryResult.changes) <= 0) {
            throw new SqliteStorageDriverError(
                "writeBlob",
                `${buildContextPath(contexts)}$${key}`,
                `Something went wrong! Value wasn't changed.`,
            );
        }
    }

    override delete(contexts: string[], key: string) {
        this.#queryDeleteBlob.run(buildContextKeyPair(contexts, key));
    }

    override has(contexts: string[], key: string) {
        const result = this.#queryHasBlob.get(buildContextKeyPair(contexts, key));
        return result?.has_record === 1;
    }

    override keys(contexts: string[]) {
        const queryResults = this.#queryKeysBlob
            .all({
                context: buildContextPath(contexts),
            })
            .filter(v => v != null);

        return queryResults.map(v => v.key);
    }

    override contexts(contexts: string[]): string[] {
        const parentCtx = contexts.length > 0 ? buildContextPath(contexts) : "";
        let subContexts: string[];

        if (contexts.length === 0) {
            const allContexts = this.#queryContextsSub.all({ contextGlob: "*" }).filter(v => v != null);

            subContexts = allContexts.map(v => {
                const firstDotIndex = v.context.indexOf(".");
                if (firstDotIndex < 0) {
                    return v.context;
                }
                return v.context.substring(0, firstDotIndex);
            });
        } else {
            const allSubContexts = this.#queryContextsSub
                .all({
                    contextGlob: escapeGlob(parentCtx) + ".*",
                })
                .filter(v => v != null);

            subContexts = allSubContexts.map(v => {
                const subKey = v.context.substring(parentCtx.length + 1);
                const dotIndex = subKey.indexOf(".");

                if (dotIndex < 0) {
                    return subKey;
                }
                return subKey.substring(0, dotIndex);
            });
        }

        return [...new Set(subContexts.filter(c => c != null && c.trim().length > 0))];
    }

    override clearAll(contexts: string[]) {
        if (contexts.length === 0) {
            return;
        }
        const contextPath = buildContextPath(contexts);

        this.#queryClearAll.run({
            context: contextPath,
            contextGlob: escapeGlob(contextPath) + ".*",
        });
    }
}
