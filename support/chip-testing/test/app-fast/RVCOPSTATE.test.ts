/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("RVCOPSTATE", () => {
    chip("RVCOPSTATE/*").subject(RvcApp);
    // Selects the runs of multi-run tests, which "RVCOPSTATE/*" does not
    chip("RVCOPSTATE/*/run*").subject(RvcApp);
});
