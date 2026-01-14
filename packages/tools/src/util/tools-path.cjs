/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const { resolve } = require("path");

// Node makes it impossible to obtain the path of the current file in a matter that transpiles cleanly to both ESM and
// CJS.  __dirname is not available in ESM but you can't reference import.meta.url in CJS even conditionally because it
// is a compile-time error.  So instead we locate the root of the tools package in this file which always runs as CJS
// and is thus importable into both ESM and CJS.
exports.toolsPath = resolve(__dirname, "../..");
