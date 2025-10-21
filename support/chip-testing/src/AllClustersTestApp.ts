#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import "@matter/nodejs";

import { AllClustersTestInstance } from "./AllClustersTestInstance.js";
import { startDeviceTestApp } from "./GenericTestApp.js";
import { StorageBackendAsyncJsonFile } from "./storage/StorageBackendAsyncJsonFile.js";

process.title = "AllClustersTestApp.js"; // Needed for Stress testing to detect the process to kill.

console.log("Start AllClustersApp");
console.log(process.pid);
console.log(process.argv);

startDeviceTestApp(AllClustersTestInstance, StorageBackendAsyncJsonFile).catch(console.error);
