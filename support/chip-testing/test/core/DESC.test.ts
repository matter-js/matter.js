/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("DESC", () => {
    chip("DESC/*/run1");
    // Selects the runs of multi-run tests the statements above do not
    chip("DESC/*/run*").exclude(
        "DESC/*/run1",
        // Runs for CHIP apps matter.js has no test subject for: electrical-protection, evse, lighting-app-no-unique-id, microwave-oven, network-management
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
    );
});
