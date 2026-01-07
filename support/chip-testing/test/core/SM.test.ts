/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcApp } from "../support.js";

describe("SM", () => {
    // All clusters
    chip("SM/*/run1");

    chip("SM/*/run12").subject(RvcApp);
});
