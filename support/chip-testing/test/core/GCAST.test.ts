/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("GCAST", () => {
    chip("GCAST/*").exclude("GCAST/2.2");
    //chip("GCAST/2.2").args("--endpoint", 0); // Currently broken
});
