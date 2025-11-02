/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("MOD", () => {
    chip("MOD/*")
        // MOD 2.3 tests add scenes management for future Matter versions (>1.4.2)
        .exclude("MOD/2.3");
});
