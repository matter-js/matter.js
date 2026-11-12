/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("MOD", () => {
    chip("MOD/*")
        // TC-MOD-2.3 is provisional in the test plan, and the specification gives CurrentMode no scene (S) quality
        .exclude("MOD/2.3");

    chip("MOD/1.2/*");
});
