/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("TSUIC", () => {
    chip("TSUIC/*");
    // Selects the runs of multi-run tests, which "TSUIC/*" does not
    chip("TSUIC/*/run*");
});
