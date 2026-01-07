/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { chip, Chip } from "@matter/testing";
import { log } from "../src/GenericTestApp.js";

// Disable stdout output required when run within CHIP test harnesses
log.directive = () => {};
log.error = (...args: any[]) => console.error(...args);

// Expose Chip testing API as a global
declare global {
    const chip: Chip;
}
Object.assign(globalThis, { chip });

await chip.initialize();

await import("./support.js");
