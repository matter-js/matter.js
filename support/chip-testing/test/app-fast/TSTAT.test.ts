/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("TSTAT", () => {
    // "TSTAT/*" would drop the runs of multi-run tests such as 2.1 and 4.2, so select below the test level
    chip("TSTAT/*/*").exclude(
        // TSTAT/4.3 is Thermostat suggestions
        "TSTAT/4.3/*",

        // Asserts the SENSORS feature unconditionally rather than gating on it.  matter.js implements Matter 1.6,
        // where Thermostat has no thermostat sensors
        "TSTAT/4.4/*",
    );
});
