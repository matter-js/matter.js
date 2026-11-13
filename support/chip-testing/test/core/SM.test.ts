/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("SM", () => {
    // From DeviceBasicComposition
    chip("SM/*/run*").exclude(
        // Runs for CHIP apps matter.js has no test subject for: evse, microwave-oven, network-management,
        // lighting-app-no-unique-id, electrical-protection
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
