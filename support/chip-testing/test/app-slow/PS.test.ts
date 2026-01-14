/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("PS", () => {
    chip("PS/*").args("--endpoint", 1);

    // AllClusters coverage in DeviceBasicComposition
    chip("PS/3.1/run1");

    // RVC coverage in DeviceBasicComposition
    chip("PS/3.1/run12").subject(RvcApp);
});
