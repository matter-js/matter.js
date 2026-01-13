/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Bytes,
  CloneableStorage,
  fromJson,
  Storage,
  StorageError,
  SupportedStorageTypes,
  toJson,
} from "@matter/general"

type SafeUint8Array = Uint8Array<ArrayBuffer>
type SQLOutputType = null | number | bigint | string | SafeUint8Array
type SQLResultType = Record<string, SQLOutputType>

export interface DatabaseLike {
  prepare<O extends SQLResultType | void>(query: string): SQLRunnableSimple<O> & SQLRunnableParam<any, O>
  exec(sql: string): void
  close(): void
}

/**
 * Helper types which define SQL input -> SQL output
 */
type KVStoreType<T extends string | SafeUint8Array = string | SafeUint8Array> = {
  context: string,
  key: string,
  value_type: T extends string ? "json" : "blob",
  value_json: T extends string ? string : null,
  value_blob: T extends SafeUint8Array ? SafeUint8Array : null,
}

type SQLRunnable<I extends SQLResultType | void, O extends SQLResultType | void> = I extends SQLResultType ? SQLRunnableParam<I, O> : SQLRunnableSimple<O>

interface SQLRunnableSimple<O extends SQLResultType | void> {
  run(): { changes: number | bigint }
  get(): O | null | undefined
  all(): Array<O | undefined> // Bun uses Array<T | undefined>
}
interface SQLRunnableParam<I extends SQLResultType, O extends SQLResultType | void> {
  run(arg: I): { changes: number | bigint }
  get(arg: I): O | null | undefined
  all(arg: I): Array<O | undefined> // Bun uses Array<T | undefined>
}

type SQLRunnableKV<
  I extends keyof KVStoreType<string> | void,
  O extends keyof KVStoreType<string> | void,
> = SQLRunnable<
  I extends keyof KVStoreType<string> ? Pick<KVStoreType<string>, I> : void,
  O extends keyof KVStoreType<string> ? Pick<KVStoreType<string>, O> : void
>



enum Transaction {
  BEGIN,
  COMMIT,
  ROLLBACK,
}

type DatabaseCreator = (path: string) => DatabaseLike

export class SqliteStorageError extends StorageError {
  constructor(
    public methodType: string,
    public contextKey: string,
    internalMessage: string
  ) {
    super(`[${methodType.toUpperCase()}] ${contextKey}: ${internalMessage}`)
  }
}

/**
 * SQLite implementation of `StorageBackendDisk.ts`
 * 
 * `DatabaseCreator` is needed to use.
 * 
 * Supports `node:sqlite`, `bun:sqlite`. (maybe also better-sqlite3)
 */
export class StorageSqliteDisk extends Storage implements CloneableStorage {
  public static readonly memoryPath = ":memory:"
  public static readonly defaultTableName = "kvstore"

  protected isInitialized = false

  readonly #database: DatabaseLike
  readonly #dbPath: string
  readonly #tableName: string
  readonly #clear: boolean
  readonly #databaseCreator: DatabaseCreator

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
      StorageSqliteDisk.memoryPath : this.ensureExtension(`${path}.db`)
    this.#databaseCreator = databaseCreator
    this.#database = databaseCreator(this.#dbPath)

    // tableName is vulnerable
    // DO NOT USE FROM USER'S INPUT
    this.#tableName = tableName ?? StorageSqliteDisk.defaultTableName
    this.#clear = clear ?? false

    /**
     * Prepare queries
     */

    // init database query
    // [], run
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
    // run once (prepare requires existing database in bun.js)
    this.#queryInit.run()

    // get value query
    // [context, key], get
    this.#queryGet = this.#database.prepare(`
      SELECT value_json FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key AND
        value_type='json'
    `)
    // get value *raw* query
    // all
    this.#queryGetRaw = this.#database.prepare(`
      SELECT * FROM ${this.#tableName}
    `)
    // set value query
    // [context, key, value_json], run
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
    // set value *raw* query
    // [context, key, value_type, value_json, value_blob], run
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
    // delete value query
    // [context, key], run
    this.#queryDelete = this.#database.prepare(`
      DELETE FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key
    `)
    // get keys query
    // [context], all
    this.#queryKeys = this.#database.prepare(`
      SELECT DISTINCT key FROM ${this.#tableName} WHERE
        context=$context
    `)
    // get values query
    // [context], all
    this.#queryValues = this.#database.prepare(`
      SELECT key, value_json FROM ${this.#tableName} WHERE
        context=$context AND
        value_type='json'
    `)
    // get contexts (both root and sub-contexts)
    // [glob_pattern], all
    this.#queryContextSub = this.#database.prepare(`
      SELECT DISTINCT context FROM ${this.#tableName} WHERE
        context GLOB $contextGlob
    `)
    // clear all data
    // [], run
    this.#queryClear = this.#database.prepare(`
      DELETE FROM ${this.#tableName}
    `)
    // clear all data in context and subcontexts
    // [context, contextLike], run
    this.#queryClearAll = this.#database.prepare(`
      DELETE FROM ${this.#tableName} WHERE
        context=$context OR context GLOB $contextGlob
    `)
    // check if key exists
    // [context, key], all
    this.#queryHas = this.#database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM ${this.#tableName}
        WHERE context=$context AND key=$key
      ) as has_record
    `)
    // open blob
    // [context, key], get
    this.#queryOpenBlob = this.#database.prepare(`
      SELECT value_type, value_json, value_blob FROM ${this.#tableName} WHERE
        context=$context AND
        key=$key
    `)
    // write blob
    // [context, key, value_blob, value_blob], run
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

  /**
   * Check *Context* is valid and build.
   */
  protected buildContextPath(contexts: string[]) {
    for (const ctx of contexts) {
      if (ctx.trim().length <= 0 || ctx.includes(".")) {
        throw new SqliteStorageError(
          "build", `{${contexts.join(",")}}`,
          "Context must not be an empty and not contain dots."
        )
      }
    }

    return contexts.join(".")
  }
  /**
   * Check *key* is valid and return key.
   */
  protected checkKey(key: string) {
    if (key.trim().length <= 0) {
      throw new SqliteStorageError(
        "build", key,
        "Key must not be an empty string."
      )
    }
    return key
  }

  /**
   * Build context, key to [builtContext, builtKey]
   */
  protected buildContextKeyArray(contexts: string[], key: string) {
    return [this.buildContextPath(contexts), this.checkKey(key)]
  }

  /**
   * build context, key for **logging**
   * 
   * DO NOT USE FOR DATABASE.
   */
  protected buildContextKeyLogPath(contexts: string[], key: string) {
    return `${this.buildContextPath(contexts)}$${key}`
  }

  /**
   * Escape letters in GLOB
   */
  protected escapeGlob(value: string) {
    return value.replace(/[*[?]/g, "[$&]")
  }

  protected ensureExtension(path: string) {
    if (path.endsWith(".db") || path.endsWith(".sqlite")) {
      return path
    }
    return `${path}.db`
  }

  /*
   === Implementing Storage methods ===
  */

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
    const queryResult = this.#queryGet.get({
      context: this.buildContextPath(contexts),
      key: this.checkKey(key),
    })
    // Bun returns null, NodeJs returns undefined
    if (queryResult == null) {
      return undefined
    }
    if (queryResult.value_json === null) {
      // Shouldn't be happened. (Confused with BLOB?)
      this.delete(contexts, key)

      throw new SqliteStorageError(
        "get", this.buildContextKeyLogPath(contexts, key),
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
          "set", this.buildContextKeyLogPath(contexts, keyOrValues),
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
      context: this.buildContextPath(contexts),
      key: this.checkKey(key),
      value_json: value,
    })
    if (Number(changes) <= 0) {
      throw new SqliteStorageError(
        "set", this.buildContextKeyLogPath(contexts, key),
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
    this.#queryDelete.run({
      context: this.buildContextPath(contexts),
      key: this.checkKey(key),
    })
  }

  override keys(contexts: string[]) {
    const queryResults = this.#queryKeys.all({
      context: this.buildContextPath(contexts),
    }).filter((v) => v != null)

    return queryResults.map((v) => v.key)
  }

  override values(contexts: string[]) {
    const queryResults = this.#queryValues.all({
      context: this.buildContextPath(contexts),
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
    const parentCtx = this.buildContextPath(contexts)
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
        contextGlob: this.escapeGlob(parentCtx) + ".*",
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
    const contextPath = this.buildContextPath(contexts)

    // Delete the context itself and all sub-contexts
    this.#queryClearAll.run({
      context: contextPath,
      contextGlob: this.escapeGlob(contextPath) + ".*",
    })
  }

  override has(contexts: string[], key: string) {
    const result = this.#queryHas.get({
      context: this.buildContextPath(contexts),
      key: this.checkKey(key),
    })
    return result?.has_record === 1
  }

  override openBlob(contexts: string[], key: string): Blob {
    const queryResult = this.#queryOpenBlob.get({
      context: this.buildContextPath(contexts),
      key: this.checkKey(key),
    })
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
      context: this.buildContextPath(contexts),
      key: this.checkKey(key),
      value_blob: bytes,
    })
    if (Number(queryResult.changes) <= 0) {
      throw new SqliteStorageError(
        "writeBlob", this.buildContextKeyLogPath(contexts, key),
        `Something went wrong! Value wasn't changed.`
      )
    }
  }
}
