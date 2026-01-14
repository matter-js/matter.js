/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Bytes,
  type CloneableStorage,
  type SupportedStorageTypes,
  fromJson,
  Storage,
  toJson,
} from "@matter/general"

import { SqliteStorageError } from "./SqliteStorageError.js"
import { buildContextKeyLog, buildContextKeyPair, buildContextPath, ensureExtension, escapeGlob } from "./SqliteStorageUtil.js"

import { SQLiteTransaction as Transaction } from "./SqliteTypes.js"
import type {
  SafeUint8Array,
  SQLRunnable,
  DatabaseLike,
  DatabaseCreator,
} from "./SqliteTypes.js"

/**
 * Type of Key-Value store table
 * 
 * T means JSON or BLOB type
 */
type KVStoreType<T extends string | SafeUint8Array = string | SafeUint8Array> = {
  context: string,
  key: string,
  value_type: T extends string ? "json" : "blob",
  value_json: T extends string ? string : null,
  value_blob: T extends SafeUint8Array ? SafeUint8Array : null,
}

/**
 * SQLRunnable with
 * 
 * `I`: keyof KVStoreType -> KVStoreType
 * `O`: keyof KVStoreType -> KVStoreType
 */
type SQLRunnableKV<
  I extends keyof KVStoreType<string> | void,
  O extends keyof KVStoreType<string> | void,
> = SQLRunnable<
  I extends keyof KVStoreType<string> ? Pick<KVStoreType<string>, I> : void,
  O extends keyof KVStoreType<string> ? Pick<KVStoreType<string>, O> : void
>

/**
 * SQLite implementation of `StorageBackendDisk.ts`
 * 
 * `DatabaseCreator` is need to use (sqlite).
 * 
 * Supports `node:sqlite`, `bun:sqlite`. (maybe also `better-sqlite3` support)
 */
export class StorageSqliteDisk extends Storage implements CloneableStorage {
  public static readonly memoryPath = ":memory:"
  public static readonly defaultTableName = "kvstore"

  protected isInitialized = false

  // internal values
  readonly #database: DatabaseLike
  readonly #dbPath: string
  readonly #tableName: string
  readonly #clear: boolean
  readonly #databaseCreator: DatabaseCreator

  // queries
  readonly #queryInit: SQLRunnable<void, void>
  readonly #queryGet: SQLRunnableKV<"context" | "key", "value_json">
  readonly #queryGetRaw: SQLRunnable<void, KVStoreType>
  readonly #querySet: SQLRunnableKV<"context" | "key" | "value_json", void>
  readonly #querySetRaw: SQLRunnable<KVStoreType, void>
  readonly #queryDelete: SQLRunnableKV<"context" | "key", void>
  readonly #queryKeys: SQLRunnableKV<"context", "key">
  readonly #queryValues: SQLRunnable<
    { context: string },
    { key: string, value_json: string }
  >
  readonly #queryContextSub: SQLRunnable<
    { contextGlob: string },
    { context: string }
  >
  readonly #queryClear: SQLRunnable<void, void>
  readonly #queryClearAll: SQLRunnable<
    { context: string, contextGlob: string },
    void
  >
  readonly #queryHas: SQLRunnable<
    { context: string, key: string },
    { has_record: 1 }
  >
  readonly #queryOpenBlob: SQLRunnable<
    Pick<KVStoreType, "context" | "key">,
    Pick<KVStoreType, "value_type" | "value_json" | "value_blob">
  >
  readonly #queryWriteBlob: SQLRunnable<
    Pick<KVStoreType, "context" | "key" | "value_blob">,
    void
  >

  /**
   * Create sqlite-based disk
   * 
   * @param args.databaseCreator database instance creator
   * @param args.path Database path (treats `null` as `:memory:`, DO NOT input `:memory:` directly)
   * @param args.clear Clear on init
   * @param args.tableName table name
   */
  constructor(args: {
    databaseCreator: DatabaseCreator,
    path: string | null,
    tableName?: string,
    clear?: boolean,
  }) {
    super()
    const { databaseCreator, path, tableName, clear } = args

    this.#dbPath = (path === null) ?
      StorageSqliteDisk.memoryPath : ensureExtension(path, ["db", "sqlite"])
    this.#databaseCreator = databaseCreator
    this.#database = databaseCreator(this.#dbPath)

    // tableName is vulnerable
    // DO NOT USE FROM USER'S INPUT
    this.#tableName = tableName ?? StorageSqliteDisk.defaultTableName
    this.#clear = clear ?? false

    // ═════════════════════════════════════════════════════════════
    // Query Preparation
    // ═════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────
    // Schema Initialization
    // ─────────────────────────────────────────────────────────────
    this.#queryInit = this.#database.prepare(`
      CREATE TABLE IF NOT EXISTS ${this.#tableName} (
        context TEXT NOT NULL,
        key TEXT NOT NULL,
        value_type TEXT CHECK(value_type IN ('json', 'blob')),
        value_json TEXT,
        value_blob BLOB,
        CONSTRAINT PKPair PRIMARY KEY (context, key)
      ) STRICT
    `)
    this.#queryInit.run() // Run once (prepare requires existing database in bun.js)

    // ─────────────────────────────────────────────────────────────
    // Read Operations
    // ─────────────────────────────────────────────────────────────
    this.#queryGet = this.#database.prepare(`
      SELECT value_json FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key AND
        value_type='json'
    `)

    this.#queryGetRaw = this.#database.prepare(`
      SELECT * FROM ${this.#tableName}
    `)

    this.#queryHas = this.#database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM ${this.#tableName}
        WHERE context=$context AND key=$key
      ) as has_record
    `)

    // ─────────────────────────────────────────────────────────────
    // Write Operations
    // ─────────────────────────────────────────────────────────────
    this.#querySet = this.#database.prepare(`
      INSERT INTO ${this.#tableName}
        (context, key, value_type, value_json, value_blob)
      VALUES($context, $key, 'json', $value_json, NULL)
      ON CONFLICT(context, key)
      DO UPDATE SET
        value_type = 'json',
        value_json = excluded.value_json,
        value_blob = NULL
    `)

    this.#querySetRaw = this.#database.prepare(`
      INSERT INTO ${this.#tableName}
        (context, key, value_type, value_json, value_blob)
      VALUES($context, $key, $value_type, $value_json, $value_blob)
      ON CONFLICT(context, key)
      DO UPDATE SET
        value_type = excluded.value_type,
        value_json = excluded.value_json,
        value_blob = excluded.value_blob
    `)

    // ─────────────────────────────────────────────────────────────
    // Delete Operations
    // ─────────────────────────────────────────────────────────────
    this.#queryDelete = this.#database.prepare(`
      DELETE FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key
    `)

    this.#queryClear = this.#database.prepare(`
      DELETE FROM ${this.#tableName}
    `)

    this.#queryClearAll = this.#database.prepare(`
      DELETE FROM ${this.#tableName} WHERE
        context=$context OR context GLOB $contextGlob
    `)

    // ─────────────────────────────────────────────────────────────
    // Context & Key Queries
    // ─────────────────────────────────────────────────────────────
    this.#queryKeys = this.#database.prepare(`
      SELECT DISTINCT key FROM ${this.#tableName} WHERE
        context=$context
    `)

    this.#queryValues = this.#database.prepare(`
      SELECT key, value_json FROM ${this.#tableName} WHERE
        context=$context AND
        value_type='json'
    `)

    this.#queryContextSub = this.#database.prepare(`
      SELECT DISTINCT context FROM ${this.#tableName} WHERE
        context GLOB $contextGlob
    `)

    // ─────────────────────────────────────────────────────────────
    // Blob Operations
    // ─────────────────────────────────────────────────────────────
    this.#queryOpenBlob = this.#database.prepare(`
      SELECT value_type, value_json, value_blob FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key
    `)

    this.#queryWriteBlob = this.#database.prepare(`
      INSERT INTO ${this.#tableName}
        (context, key, value_type, value_json, value_blob)
      VALUES($context, $key, 'blob', NULL, $value_blob)
      ON CONFLICT(context, key)
      DO UPDATE SET
        value_type = 'blob',
        value_json = NULL,
        value_blob = excluded.value_blob
    `)

  }

  /**
   * Start transaction
   */
  protected transaction(mode: Transaction) {
    switch (mode) {
      case Transaction.BEGIN:
        this.#database.exec("BEGIN IMMEDIATE TRANSACTION")
        break
      case Transaction.COMMIT:
        this.#database.exec("COMMIT")
        break
      case Transaction.ROLLBACK:
        this.#database.exec("ROLLBACK")
        break
    }
  }

  override get initialized() {
    return this.isInitialized
  }

  override async initialize(migrate = false): Promise<void> {
    if (this.#clear) {
      this.clear()
    }
    if (migrate) {
      // migrate
    }
    this.isInitialized = true
  }

  public async clone() {
    const clonedStorage = new StorageSqliteDisk({
      databaseCreator: this.#databaseCreator,
      path: null,
      tableName: this.#tableName,
      clear: false,
    })
    await clonedStorage.initialize(false)

    const rawData = this.getRawAll()
    clonedStorage.setRaw(rawData)
    return clonedStorage
  }

  override close() {
    this.isInitialized = false
    this.#database.close()
  }

  override get<T extends SupportedStorageTypes>(contexts: string[], key: string): T | null | undefined {
    const queryResult = this.#queryGet.get(
      buildContextKeyPair(contexts, key)
    )
    // Bun returns null, NodeJs returns undefined
    if (queryResult == null) {
      return undefined
    }
    if (queryResult.value_json === null) {
      // Shouldn't be happened. (Confused with BLOB?)
      this.delete(contexts, key)

      throw new SqliteStorageError(
        "get", buildContextKeyLog(contexts, key),
        "path has null json-value! (expected non-null value)"
      )
    }

    return fromJson(queryResult.value_json) as T | null
  }

  protected getRawAll() {
    return this.#queryGetRaw.all().filter((v) => v != null)
  }

  override set(contexts: string[], key: string, value: SupportedStorageTypes): void
  override set(contexts: string[], values: Record<string, SupportedStorageTypes>): void
  override set(
    contexts: string[],
    keyOrValues: string | Record<string, SupportedStorageTypes>,
    value?: SupportedStorageTypes,
  ) {
    if (typeof keyOrValues === "string") {
      if (value === undefined) {
        // If user called set(contexts, key),
        // indented behavior should be error instead of setting `undefined JSON`.
        throw new SqliteStorageError(
          "set", buildContextKeyLog(contexts, keyOrValues),
          "Use null instead of undefined if you want to store null value!"
        )
      }
      this.setValue(contexts, keyOrValues, toJson(value))
    } else {
      // use transaction
      try {
        this.transaction(Transaction.BEGIN)
        for (const [key, value] of Object.entries(keyOrValues)) {
          this.setValue(contexts, key, toJson(value ?? null))
        }
        this.transaction(Transaction.COMMIT)
      } catch (err) {
        this.transaction(Transaction.ROLLBACK)
        throw err
      }
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
    })
    if (Number(changes) <= 0) {
      throw new SqliteStorageError(
        "set", buildContextKeyLog(contexts, key),
        `Something went wrong! Value wasn't changed.`
      )
    }
  }

  /**
   * Set Raw data. (for copy)
   */
  protected setRaw(rawData: KVStoreType[]) {
    if (rawData.length <= 0) {
      return
    }
    if (rawData.length === 1) {
      const raw = rawData[0]
      const { changes } = this.#querySetRaw.run({
        context: raw.context, key: raw.key, value_type: raw.value_type, value_json: raw.value_json, value_blob: raw.value_blob,
      })
      if (Number(changes) <= 0) {
        throw new SqliteStorageError(
          "setraw", `${raw.context}$${raw.key}`,
          `Something went wrong! Value wasn't changed.`
        )
      }
      return
    }
    try {
      this.transaction(Transaction.BEGIN)
      for (const raw of rawData) {
        const { changes } = this.#querySetRaw.run({
          context: raw.context, key: raw.key, value_type: raw.value_type, value_json: raw.value_json, value_blob: raw.value_blob,
        })
        if (Number(changes) <= 0) {
          throw new SqliteStorageError(
            "setraw", `${raw.context}$${raw.key}`,
            `Something went wrong! Value wasn't changed.`
          )
        }
      }
      this.transaction(Transaction.COMMIT)
    } catch (err) {
      this.transaction(Transaction.ROLLBACK)
      throw err
    }
  }

  override delete(contexts: string[], key: string) {
    this.#queryDelete.run(
      buildContextKeyPair(contexts, key)
    )
  }

  override keys(contexts: string[]) {
    const queryResults = this.#queryKeys.all({
      context: buildContextPath(contexts),
    }).filter((v) => v != null)

    return queryResults.map((v) => v.key)
  }

  override values(contexts: string[]) {
    const queryResults = this.#queryValues.all({
      context: buildContextPath(contexts),
    }).filter((v) => v != null)

    const record = Object.create(null) as Record<string, SupportedStorageTypes>

    for (const element of queryResults) {
      record[element.key] = fromJson(element.value_json)
    }

    return record
  }

  /**
   * Return sub contexts of context
   * (search nested depth, return 1 depth of them)
   * @param contexts context path
   * @returns sub contexts
   */
  override contexts(contexts: string[]): string[] {
    const parentCtx = buildContextPath(contexts)
    let subContexts: string[]

    if (contexts.length === 0) {
      // Query all root contexts (may include nested ones)
      const allContexts = this.#queryContextSub.all({ contextGlob: "*" }).filter((v) => v != null)

      subContexts = allContexts.map((v) => {
        const firstDotIndex = v.context.indexOf(".")
        if (firstDotIndex < 0) {
          // root
          return v.context
        }
        return v.context.substring(0, firstDotIndex)
      })
    } else {
      // Query all sub-contexts (may include deeply nested ones)
      const allSubContexts = this.#queryContextSub.all({
        contextGlob: escapeGlob(parentCtx) + ".*",
      }).filter((v) => v != null)

      subContexts = allSubContexts.map((v) => {
        const subKey = v.context.substring(parentCtx.length + 1)
        const dotIndex = subKey.indexOf(".")

        if (dotIndex < 0) {
          // direct child
          return subKey
        }
        return subKey.substring(0, dotIndex)
      })
    }

    // Remove duplicates and empty values
    return [...new Set(subContexts.filter(
      c => c != null && c.trim().length > 0
    ))]
  }

  public clear() {
    this.#queryClear.run()
  }

  override clearAll(contexts: string[]) {
    // Match StorageBackendDisk behavior: if contexts is empty, do nothing
    if (contexts.length === 0) {
      return
    }
    const contextPath = buildContextPath(contexts)

    // Delete the context itself and all sub-contexts
    this.#queryClearAll.run({
      context: contextPath,
      contextGlob: escapeGlob(contextPath) + ".*",
    })
  }

  override has(contexts: string[], key: string) {
    const result = this.#queryHas.get(
      buildContextKeyPair(contexts, key)
    )
    return result?.has_record === 1
  }

  override openBlob(contexts: string[], key: string): Blob {
    const queryResult = this.#queryOpenBlob.get(
      buildContextKeyPair(contexts, key)
    )
    if (queryResult == null) {
      return new Blob()
    }
    if (queryResult.value_type === "blob" && queryResult.value_blob != null) {
      return new Blob([new Uint8Array(queryResult.value_blob)])
    }
    if (queryResult.value_type === "json" && queryResult.value_json != null) {
      return new Blob([queryResult.value_json])
    }

    // Corrupted context$key
    this.delete(contexts, key)
    return new Blob()
  }

  override async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>) {
    const arrayBuffer = await new Response(stream).arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    const queryResult = this.#queryWriteBlob.run({
      ...buildContextKeyPair(contexts, key),
      value_blob: bytes,
    })
    if (Number(queryResult.changes) <= 0) {
      throw new SqliteStorageError(
        "writeBlob", buildContextKeyLog(contexts, key),
        `Something went wrong! Value wasn't changed.`
      )
    }
  }
}
