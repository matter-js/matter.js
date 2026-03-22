/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export * from "./BytesStreamReader.js";
export * from "./DatafileRoot.js";
export * from "./DataNamespace.js";
export * from "./MemoryStorageDriver.js";
export * from "./MockStorageService.js";
export * from "./StorageContext.js";
export * from "./StorageDriver.js";
export * from "./StorageDriverHandle.js";
export * from "./StorageManager.js";
export * from "./StorageMigration.js";
export * from "./StorageService.js";
export * from "./StorageTransaction.js";
export * from "./StringifyTools.js";
export * from "./wal/index.js";
export * from "./WebStorageDriver.js";
import { MemoryStorageDriver } from "./MemoryStorageDriver.js";

/** @deprecated Use {@link MemoryStorageDriver} */
export const StorageBackendMemory = MemoryStorageDriver;
