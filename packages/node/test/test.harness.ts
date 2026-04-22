/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Package } from "@nacho-iot/js-tools";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Create a synthetic "@matter/test-plugins" package that points to the compiled test plugin fixtures.  This allows
// plugin tests to use real module specifiers with the platform's `load()` function.
//
// The package uses conditional exports so that ESM `import()` and CJS `require()` each resolve to the matching
// build format, avoiding cross-format class identity mismatches (e.g. Behavior instanceof checks).

const pkg = new Package();
const syntheticPkgDir = resolve(Package.workspace.resolve("node_modules/@matter"), "test-plugins");

if (!existsSync(syntheticPkgDir)) {
    mkdirSync(syntheticPkgDir, { recursive: true });

    const esmDir = pkg.resolve("build/esm/test/node/plugins");
    const cjsDir = pkg.resolve("build/cjs/test/node/plugins");

    symlinkSync(esmDir, resolve(syntheticPkgDir, "esm"));
    symlinkSync(cjsDir, resolve(syntheticPkgDir, "cjs"));

    writeFileSync(
        resolve(syntheticPkgDir, "package.json"),
        JSON.stringify(
            {
                name: "@matter/test-plugins",
                exports: {
                    "./*": {
                        import: "./esm/*",
                        require: "./cjs/*",
                    },
                },
            },
            undefined,
            4,
        ),
    );
}
