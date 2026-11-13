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

    // run1 targets the CHIP energy-management (EVSE) app, which matter.js has no test subject for
    chip("PWRTL/2.1/run2");
});
