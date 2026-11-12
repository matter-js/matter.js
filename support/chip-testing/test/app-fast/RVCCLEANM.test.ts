/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("RVCCLEANM", () => {
    chip("RVCCLEANM/*").subject(RvcApp);
    // Selects the runs of multi-run tests, which "RVCCLEANM/*" does not
    chip("RVCCLEANM/*/run*").subject(RvcApp);
});
