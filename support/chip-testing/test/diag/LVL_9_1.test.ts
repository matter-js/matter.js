/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Diagnostic-only file. Runs a single chip test with --all-logs so we can
// inspect the actual chip subprocess output. Currently used to triage why
// TC_LVL_9_1 fails with newer chip pins. Remove once the underlying issue is
// understood.
describe("LVL", () => {
    chip("LVL/9.1");
});
