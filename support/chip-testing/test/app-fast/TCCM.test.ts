/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("TCCM", () => {
    chip("TCCM/*").exclude(
        // Exclude till https://github.com/project-chip/connectedhomeip/pull/38377 got merged and we have a new container
        "TCCM/1.2",
    );
});
