/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("PWRTL", () => {
    chip("PWRTL/*").exclude(
        // Requires the PowerTopology CIRC feature, which matter.js does not implement, so the test skips itself and
        // our runner reports a skip as a failure
        "PWRTL/2.2",
    );
    // Selects the runs of multi-run tests, which "PWRTL/*" does not
    chip("PWRTL/*/run*").exclude("PWRTL/2.2/*").exclude(
        // Runs for CHIP apps matter.js has no test subject for: evse
        "PWRTL/2.1/run1",
    );
});
