/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stores various utility types used by sqlite disk.
 */

// bytes
export type SafeUint8Array = Uint8Array<ArrayBuffer>;
// TEXT, BLOB, NUMBER, null
export type SqliteDataType = null | number | bigint | string | SafeUint8Array;
// Key-Value of SQLiteDataType
export type SqliteResultType = Record<string, SqliteDataType>;

/**
 * DatabaseLike
 *
 * compatible with `node:sqlite`(type mismatch), `bun:sqlite`
 */
export interface DatabaseLike {
    prepare<O extends SqliteResultType | void>(query: string): SqlRunnableSimple<O> & SqlRunnableParam<any, O>;
    exec(sql: string): void;
    close(): void;
}

export type DatabaseCreator = (path: string) => DatabaseLike;

/**
 * Defines `I` -> `O` Runnable
 *
 * `I` type is treated as Input.
 *
 * `O` type is treated as Output.
 *
 * `void` type is used for no input/output.
 */
export type SqlRunnable<
    I extends SqliteResultType | void,
    O extends SqliteResultType | void,
> = I extends SqliteResultType ? SqlRunnableParam<I, O> : SqlRunnableSimple<O>;

/**
 * Database method with no parameter.
 *
 * (`I` must be void)
 */
interface SqlRunnableSimple<O extends SqliteResultType | void> {
    run(): { changes: number | bigint };
    get(): O | null | undefined;
    all(): Array<O | undefined>; // Bun uses Array<T | undefined>
}

/**
 * Database method with parameter.
 */
interface SqlRunnableParam<I extends SqliteResultType, O extends SqliteResultType | void> {
    run(arg: I): { changes: number | bigint };
    get(arg: I): O | null | undefined;
    all(arg: I): Array<O | undefined>; // Bun uses Array<T | undefined>
}

/**
 * SQLite Transaction mode
 *
 * TODO: Move transaction control to higher level (matter.js Transaction API)
 * and remove this
 */
export enum SqliteTransaction {
    BEGIN,
    COMMIT,
    ROLLBACK,
}
