/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot } from "@matter/general";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeHeapSnapshot } from "node:v8";
import { Environment, StorageService } from "@matter/main";
import { chip, Chip } from "@matter/testing";
import { log } from "../src/GenericTestApp.js";
import { startLocalController } from "../src/local-controller.js";

// Disable stdout output required when run within CHIP test harnesses
log.directive = () => {};
log.error = (...args: any[]) => console.error(...args);

// Expose Chip testing API as a global
declare global {
    const chip: Chip;
}
Object.assign(globalThis, { chip });

await chip.initialize();

// DIAGNOSTIC ONLY (not for merge): heap trend per cert case on CI, and one snapshot past 1.8 GB
let snapshotWritten = false;
setInterval(() => {
    const { heapUsed, rss } = process.memoryUsage();
    if (!snapshotWritten && heapUsed > 1800 * 1048576) {
        snapshotWritten = true;
        const dir = fileURLToPath(new URL("../../cert-evidence/", import.meta.url));
        mkdirSync(dir, { recursive: true });
        process.stderr.write(`HEAPDIAG snapshot ${writeHeapSnapshot(`${dir}heap-${process.pid}.heapsnapshot`)}\n`);
    }
    process.stderr.write(`HEAPDIAG heapUsed=${Math.round(heapUsed / 1048576)}MB rss=${Math.round(rss / 1048576)}MB\n`);
}, 20_000).unref();

// Default to memory driver for tests; overridable via MATTER_STORAGE_DRIVER env var.  We use Boot.init so the
// setting survives Boot.reboot() which the test runner calls before each file
Boot.init(() => {
    const service = Environment.default.get(StorageService);
    if (!service.configuredDriver || service.configuredDriver === "file") {
        service.configuredDriver = "memory";
    }
});

if (process.env.MATTER_LOCAL_CONTROLLER) {
    const port = process.env.MATTER_CONTROLLER_PORT ? parseInt(process.env.MATTER_CONTROLLER_PORT, 10) : 9002;
    const close = await startLocalController({ port });
    chip.onClose(close);
}

await import("./support.js");
await import("../src/cert/index.js");
