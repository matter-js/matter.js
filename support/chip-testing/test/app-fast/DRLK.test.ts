/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("DRLK", () => {
    chip("DRLK/*").exclude(
        // Aliro — not implemented
        "DRLK/2.9",
        "DRLK/2.13",
    );
});
