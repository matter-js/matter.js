/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("SEAR", () => {
    chip("SEAR/*").subject(RvcApp);
    // Selects the runs of multi-run tests, which "SEAR/*" does not
    chip("SEAR/*/run*").subject(RvcApp);
});
