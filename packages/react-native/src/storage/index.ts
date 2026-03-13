/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export * from "./ReactNativeWebStorageDriver.js";
export * from "./ReactNativeWebStorageDriverV2.js";
import { ReactNativeWebStorageDriver } from "./ReactNativeWebStorageDriver.js";
import { ReactNativeWebStorageDriverV2 } from "./ReactNativeWebStorageDriverV2.js";

/** @deprecated Use {@link ReactNativeWebStorageDriver} */
export const StorageBackendAsyncStorage = ReactNativeWebStorageDriver;

/** @deprecated Use {@link ReactNativeWebStorageDriverV2} */
export const StorageBackendAsyncStorageV2 = ReactNativeWebStorageDriverV2;
