/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stores various utility types used by sqlite disk.
 */

// bytes
export type SafeUint8Array = Uint8Array<ArrayBuffer>
// TEXT, BLOB, NUMBER, null
export type SQLiteDataType = null | number | bigint | string | SafeUint8Array
// Key-Value of SQLiteDataType
export type SQLiteResultType = Record<string, SQLiteDataType>

/**
 * DatabaseLike
 * 
 * compatible with `node:sqlite`(type mismatch), `bun:sqlite`
 */
export interface DatabaseLike {
  prepare<O extends SQLiteResultType | void>(query: string): SQLRunnableSimple<O> & SQLRunnableParam<any, O>
  exec(sql: string): void
  close(): void
}

export type DatabaseCreator = (path: string) => DatabaseLike

/**
 * Defines `I` -> `O` Runnable
 * 
 * `I` type is treated as Input.
 * 
 * `O` type is treated as Output.
 * 
 * `void` type is used for no input/output.
 */
export type SQLRunnable<
  I extends SQLiteResultType | void,
  O extends SQLiteResultType | void
> = I extends SQLiteResultType ? SQLRunnableParam<I, O> : SQLRunnableSimple<O>

/**
 * Database method with no parameter.
 * 
 * (`I` must be void)
 */
interface SQLRunnableSimple<O extends SQLiteResultType | void> {
  run(): { changes: number | bigint }
  get(): O | null | undefined
  all(): Array<O | undefined> // Bun uses Array<T | undefined>
}

/**
 * Database method with parameter.
 */
interface SQLRunnableParam<I extends SQLiteResultType, O extends SQLiteResultType | void> {
  run(arg: I): { changes: number | bigint }
  get(arg: I): O | null | undefined
  all(arg: I): Array<O | undefined> // Bun uses Array<T | undefined>
}

/**
 * SQLite Transaction mode
 */
export enum SQLiteTransaction {
  BEGIN,
  COMMIT,
  ROLLBACK,
}