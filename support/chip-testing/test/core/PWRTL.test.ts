/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("PWRTL", () => {
    chip("PWRTL/*").exclude(
        // run1 targets the CHIP energy-management (EVSE) app, which matter.js has no test subject for
        "PWRTL/2.1/run1",
    );
});
