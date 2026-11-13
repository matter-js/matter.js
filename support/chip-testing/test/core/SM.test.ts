/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("SM", () => {
    // From DeviceBasicComposition
    chip("SM/*/run*").exclude(
        // The lock runs 3 to 8 differ from run2 only in how the TH commissions, and the harness commissions every run
        // the same way
        "SM/1.1/run3",
        "SM/1.1/run4",
        "SM/1.1/run5",
        "SM/1.1/run6",
        "SM/1.1/run7",
        "SM/1.1/run8",
        "SM/1.2/run3",
        "SM/1.2/run4",
        "SM/1.2/run5",
        "SM/1.2/run6",
        "SM/1.2/run7",
        "SM/1.2/run8",
        // TC_SM_1_2 checks every endpoint but an Aggregator as tree composition, but a Bridged Node lists its full family
        // (Device Library § 2.5), so the endpoints below a bridged cooktop have two paths to the root
        "SM/1.2/run19",
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
