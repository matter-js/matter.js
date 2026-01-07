/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("DT", () => {
    // These are from DeviceBasicComposition
    chip("DT/1.1/run1");
    chip("DT/1.1/run12").subject(RvcApp);
});
