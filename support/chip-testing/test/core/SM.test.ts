/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("SM", () => {
    // All clusters
    chip("SM/*/run1");

    chip("SM/*/run12").subject(RvcApp);
    // Selects the runs of multi-run tests the statements above do not
    chip("SM/*/run*").exclude(
        "SM/*/run1",
        "SM/*/run12",
        // Runs for CHIP apps matter.js has no test subject for: electrical-protection, evse, lighting-app-no-unique-id, microwave-oven, network-management
        "SM/1.1/run10",
        "SM/1.1/run12",
        "SM/1.1/run14",
        "SM/1.1/run15",
        "SM/1.1/run20",
        "SM/1.2/run10",
        "SM/1.2/run12",
        "SM/1.2/run14",
        "SM/1.2/run15",
        "SM/1.2/run20",
    );
});
