/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("WNCV", () => {
    chip("WNCV/*");
    // Selects the runs of multi-run tests, which "WNCV/*" does not
    chip("WNCV/*/run*");
});
