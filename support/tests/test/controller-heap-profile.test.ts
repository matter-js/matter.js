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
import { analyzeHeap } from "../src/heap/heap-analysis.js";

const DEVICE_COUNT = 20;
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

            // Commission all devices sequentially
            for (let i = 0; i < DEVICE_COUNT; i++) {
                await controller.commission(BASE_DISCRIMINATOR + i, PASSCODE, i + 1);
            }

            // Take heap snapshot in the controller child process
            const heapDir = join("build", "heaps");
            await mkdir(heapDir, { recursive: true });
            const snapshotPath = join(heapDir, "controller-snapshot.heapsnapshot");
            await controller.snapshot(snapshotPath);

            // Analyze in the parent process
            await analyzeHeap(snapshotPath, "build/heap-analysis");

            await controller.stop();
        } finally {
            await controller.close();
            await devices.close();
        }
    }).timeout(600_000);
});
