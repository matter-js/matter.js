/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("WNCV", () => {
    chip("WNCV/*");
    // Selects the runs of multi-run tests, which "WNCV/*" does not
    chip("WNCV/*/run*").exclude(
        // CHIP's window covering variants with other feature sets; the all-devices app has only "window-covering"
        "WNCV/*/run3",
        "WNCV/*/run4",
        "WNCV/*/run5",
        "WNCV/*/run6",
    );
});
