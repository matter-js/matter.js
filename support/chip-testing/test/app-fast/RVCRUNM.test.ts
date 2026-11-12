/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("RVCRUNM", () => {
    chip("RVCRUNM/*").subject(RvcApp);
    // Selects the runs of multi-run tests, which "RVCRUNM/*" does not
    chip("RVCRUNM/*/run*").subject(RvcApp);
});
