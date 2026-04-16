/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("GC", () => {
    chip("GC/*").exclude("GC/2.2");
    //chip("GC/2.2").args("--endpoint", 0); // Currently broken
});
