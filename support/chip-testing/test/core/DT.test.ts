/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
describe("DT", () => {
    // These are from DeviceBasicComposition
    chip("DT/*/run*").exclude(
        // Runs for CHIP apps matter.js has no test subject for: evse, microwave-oven, network-management,
        // lighting-app-no-unique-id, electrical-protection
        "DT/1.1/run10",
        "DT/1.1/run12",
        "DT/1.1/run14",
        "DT/1.1/run15",
        "DT/1.1/run20",
    );
});
