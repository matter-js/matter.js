/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AllDevicesApp } from "../support.js";

describe("PS", () => {
    chip("PS/*").args("--endpoint", 1).exclude(
        "PS/2.3",

        // Registered below without the endpoint argument
        "PS/3.1/run1",

        // The lock runs 3 to 8 differ from run2 only in how the TH commissions, and the harness commissions every run
        // the same way
        "PS/3.1/run3",
        "PS/3.1/run4",
        "PS/3.1/run5",
        "PS/3.1/run6",
        "PS/3.1/run7",
        "PS/3.1/run8",
        // Runs for CHIP apps matter.js has no test subject for: electrical-protection, evse, lighting-app-no-unique-id, microwave-oven, network-management
        "PS/3.1/run10",
        "PS/3.1/run12",
        "PS/3.1/run14",
        "PS/3.1/run15",
        "PS/3.1/run20",
    );

    // A python test with a single run does not select its app, so this names the all-devices power-source subject
    chip("PS/2.3").subject(AllDevicesApp);

    // AllClusters coverage in DeviceBasicComposition
    chip("PS/3.1/run1");
});
