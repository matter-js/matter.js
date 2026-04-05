/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export * from "./FileStorageDriver.js";
export * from "./JsonFileStorageDriver.js";
import { FileStorageDriver } from "./FileStorageDriver.js";
import { JsonFileStorageDriver } from "./JsonFileStorageDriver.js";

/** @deprecated Use {@link FileStorageDriver} */
export const StorageBackendDisk = FileStorageDriver;
/** @deprecated Use {@link FileStorageDriver} */
export type StorageBackendDisk = FileStorageDriver;

/** @deprecated Use {@link JsonFileStorageDriver} */
export const StorageBackendJsonFile = JsonFileStorageDriver;
/** @deprecated Use {@link JsonFileStorageDriver} */
export type StorageBackendJsonFile = JsonFileStorageDriver;
