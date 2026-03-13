/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export { WalSnapshot } from "./WalSnapshot.js";
export { WalStorageDriver } from "./WalStorageDriver.js";
import { WalStorageDriver } from "./WalStorageDriver.js";

/** @deprecated Use {@link WalStorageDriver} */
export const WalStorage = WalStorageDriver;
