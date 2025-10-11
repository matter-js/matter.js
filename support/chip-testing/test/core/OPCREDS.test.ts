/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("OPCREDS", () => {
    chip("OPCREDS/*").exclude(
        // Temporarily exclude pending https://github.com/project-chip/connectedhomeip/pull/41374
        // TODO - resurrect once above is addressed
        "OPCREDS/3.4",

        // These are Matter 1.5
        "OPCREDS/3.8",
        "OPCREDS/3.9",
    );
});
