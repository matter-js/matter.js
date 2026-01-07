#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import "@matter/nodejs";
import { startDeviceTestApp } from "./GenericTestApp.js";
import { RvcTestInstance } from "./RvcTestInstance.js";

console.log("Start RVCApp");
console.log(process.pid);
console.log(process.argv);

startDeviceTestApp(RvcTestInstance).catch(console.error);
