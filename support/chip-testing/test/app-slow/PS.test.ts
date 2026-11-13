/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AllDevicesApp, RvcApp } from "../support.js";

describe("PS", () => {
    chip("PS/*").args("--endpoint", 1).exclude("PS/2.3");
    // Selects the runs of multi-run tests, which "PS/*" does not
    chip("PS/*/run*").args("--endpoint", 1).exclude("PS/2.3/*").exclude("PS/3.1/run1", "PS/3.1/run12").exclude(
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

    // RVC coverage in DeviceBasicComposition
    chip("PS/3.1/run12").subject(RvcApp);
});
