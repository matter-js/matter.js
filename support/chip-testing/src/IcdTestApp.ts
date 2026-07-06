#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import "@matter/nodejs";

import { startDeviceTestApp } from "./GenericTestApp.js";
import { IcdTestInstance } from "./IcdTestInstance.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

process.title = "IcdTestApp.js";

console.log("Start IcdTestApp");
console.log(process.pid);
console.log(process.argv);

startDeviceTestApp(IcdTestInstance, StorageBackendAsyncJsonFile).catch(console.error);
