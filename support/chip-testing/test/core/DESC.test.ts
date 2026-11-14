/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("DESC", () => {
    chip("DESC/*/run*").exclude(
        // The lock runs 3 to 8 differ from run2 only in how the TH commissions, and the harness commissions every run
        // the same way
        "DESC/2.1/run3",
        "DESC/2.1/run4",
        "DESC/2.1/run5",
        "DESC/2.1/run6",
        "DESC/2.1/run7",
        "DESC/2.1/run8",
        "DESC/2.2/run3",
        "DESC/2.2/run4",
        "DESC/2.2/run5",
        "DESC/2.2/run6",
        "DESC/2.2/run7",
        "DESC/2.2/run8",
        // Runs for CHIP apps matter.js has no test subject for: camera, evse, microwave-oven, network-management,
        // lighting-app-no-unique-id, electrical-protection
        "DESC/2.1/run10",
        "DESC/2.1/run12",
        "DESC/2.1/run14",
        "DESC/2.1/run15",
        "DESC/2.1/run20",
        "DESC/2.2/run10",
        "DESC/2.2/run12",
        "DESC/2.2/run14",
        "DESC/2.2/run15",
        "DESC/2.2/run20",
        "DESC/2.1/run21",
        "DESC/2.2/run21",
        "DESC/2.3/run3",
    );
});
