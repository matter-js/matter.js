/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("WNCV", () => {
    chip("WNCV/*").exclude(
        // Runs 3 to 6 start all-devices variants (curtain, shutter, awning, pergola); the matter.js all-devices app has
        // only "window-covering"
        "WNCV/*/run3",
        "WNCV/*/run4",
        "WNCV/*/run5",
        "WNCV/*/run6",
    );
});
