/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("TSTAT", () => {
    chip("TSTAT/*").exclude(
        // Asserts the SENSORS feature unconditionally rather than gating on it.  matter.js implements Matter 1.6,
        // where Thermostat has no thermostat sensors
        "TSTAT/4.4/*",
    );
});
