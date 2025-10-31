/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("CC", () => {
    chip("CC/*").exclude(
        // CC tests are incredibly slow so we split these out into CC.2.test.ts for CI purposes
        "CC/5.*",
        "CC/6.*",
        "CC/7.*",
        "CC/8.*",

        // has too exact, expectations on transition results
        "CC/9.1",
        "CC/9.2",
        "CC/9.3",
    );
});
