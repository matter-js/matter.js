/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export { SqliteBlobStorageDriver } from "./SqliteBlobStorageDriver.js";
export { SqliteStorageDriver } from "./SqliteStorageDriver.js";
export { SqliteStorageDriverError } from "./SqliteStorageDriverError.js";
export type { DatabaseCreator, DatabaseLike } from "./SqliteTypes.js";
import { SqliteStorageDriver } from "./SqliteStorageDriver.js";

/** @deprecated Use {@link SqliteStorageDriver} */
export const SqliteStorage = SqliteStorageDriver;
/** @deprecated Use {@link SqliteStorageDriver} */
export type SqliteStorage = SqliteStorageDriver;
