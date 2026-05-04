#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import "@matter/nodejs";

import { AllDevicesTestInstance } from "./AllDevicesTestInstance.js";
import { startDeviceTestApp } from "./GenericTestApp.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

process.title = "AllDevicesTestApp.js"; // Needed for Stress testing to detect the process to kill.

console.log("Start AllDevicesApp");
console.log(process.pid);
console.log(process.argv);

startDeviceTestApp(AllDevicesTestInstance, StorageBackendAsyncJsonFile).catch(console.error);
