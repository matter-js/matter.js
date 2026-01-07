/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Package } from "#tools";
import { existsSync } from "node:fs";

export function listSupportFiles(format = "cjs") {
    const files = Array<string>();

    // Always load tooling code in ESM format as tooling globals load as ESM
    const testing = Package.tools.findPackage("@matter/testing");
    files.push(testing.resolve("dist/esm/global-definitions.js"));
    files.push(testing.resolve("dist/esm/chai.js"));
    files.push(testing.resolve("dist/esm/mocks/index.js"));

    // Package code should load in the format being tested
    const config = new Package().resolve(`build/${format}/test/test.config.js`);
    if (existsSync(config)) {
        files.push(config);
    }

    return files;
}
