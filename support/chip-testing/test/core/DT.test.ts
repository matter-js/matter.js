/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("DT", () => {
    // These are from DeviceBasicComposition
    chip("DT/1.1/run1");
    chip("DT/1.1/run12").subject(RvcApp);
    // Selects the runs of multi-run tests the statements above do not
    chip("DT/*/run*").exclude(
        "DT/1.1/run1",
        "DT/1.1/run12",
        // Runs for CHIP apps matter.js has no test subject for: electrical-protection, evse, lighting-app-no-unique-id, microwave-oven, network-management
        "DT/1.1/run10",
        "DT/1.1/run12",
        "DT/1.1/run14",
        "DT/1.1/run15",
        "DT/1.1/run20",
    );
});
