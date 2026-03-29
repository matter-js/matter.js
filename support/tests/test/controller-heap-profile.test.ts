/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import "../src/common/test-environment.js";
import { ControllerPool } from "../src/controller/heap-controller-parent.js";
import { DevicePool } from "../src/device/devices-parent.js";
import { analyzeHeap, analyzeHeapDelta } from "../src/heap/heap-analysis.js";

const DEVICE_COUNT = 20;
const BASELINE_COUNT = 5;
const BASE_DISCRIMINATOR = 3000;
const BASE_PORT = 5540;
const PASSCODE = 20202021;

describe("controller heap profile", () => {
    it("captures controller memory after commissioning many devices", async () => {
        const devices = new DevicePool();
        const controller = new ControllerPool();

        try {
            // Start all devices in the child process
            for (let i = 0; i < DEVICE_COUNT; i++) {
                await devices.startDevice(BASE_DISCRIMINATOR + i, PASSCODE, BASE_PORT + i);
            }

            // Start the controller in its own child process
            await controller.start();

            const heapDir = join("build", "heaps");
            await mkdir(heapDir, { recursive: true });

            // Commission baseline devices and take first snapshot
            for (let i = 0; i < BASELINE_COUNT; i++) {
                await controller.commission(BASE_DISCRIMINATOR + i, PASSCODE, i + 1);
            }
            const baselinePath = join(heapDir, "controller-baseline.heapsnapshot");
            await controller.snapshot(baselinePath);

            // Commission remaining devices and take second snapshot
            for (let i = BASELINE_COUNT; i < DEVICE_COUNT; i++) {
                await controller.commission(BASE_DISCRIMINATOR + i, PASSCODE, i + 1);
            }
            const finalPath = join(heapDir, "controller-final.heapsnapshot");
            await controller.snapshot(finalPath);

            // Analyze both snapshots
            await analyzeHeap(finalPath, "build/heap-analysis");
            await analyzeHeapDelta(baselinePath, finalPath, DEVICE_COUNT - BASELINE_COUNT, "build/heap-analysis", {
                trackedTypes: [
                    "DataModelPath",
                    "BasicObservable",
                    "Construction2",
                    "LifetimeImplementation",
                    "Set",
                    "closure:(anonymous)",
                    "closure:get value",
                    "closure:set value",
                    "closure:change",
                ],
            });

            await controller.stop();
        } finally {
            await controller.close();
            await devices.close();
        }
    }).timeout(600_000);
});
