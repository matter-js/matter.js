/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot } from "@matter/general";
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
