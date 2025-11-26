/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("I", () => {
    chip("I/*").exclude(
        // This test validates Q quality added in Matter 1.4.2
        // Can be enabled when https://github.com/project-chip/connectedhomeip/pull/42128 got merged
        "I/2.4",
    );
});
