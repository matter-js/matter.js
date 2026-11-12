/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("WHM", () => {
    chip("WHM/*");
    // Selects the runs of multi-run tests, which "WHM/*" does not
    chip("WHM/*/run*");
});
