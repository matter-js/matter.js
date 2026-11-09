/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AllDevicesApp, RvcApp } from "../support.js";

describe("PS", () => {
    chip("PS/*").args("--endpoint", 1).exclude("PS/2.3");

    // A python test with a single run does not select its app, so this names the all-devices power-source subject
    chip("PS/2.3").subject(AllDevicesApp);

    // AllClusters coverage in DeviceBasicComposition
    chip("PS/3.1/run1");

    // RVC coverage in DeviceBasicComposition
    chip("PS/3.1/run12").subject(RvcApp);
});
