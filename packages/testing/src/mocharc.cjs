/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This file configures mocha for "buildless" dev execution.  May be useful for running tests in IDE with Mocha support.
// Utilize by importing into .mocharc.cjs as a sibling of package.json in the package to test

// Required for Node < 19 (see node-shims.ts)
const webcrypto = require("node:crypto").webcrypto;
if (globalThis.crypto === undefined) {
    Object.assign(globalThis, { crypto: webcrypto });
}

function mocharc(format = "cjs") {
    const { resolve } = require("path");
    const cli = require("mocha/lib/cli/cli");
    const listSupportFiles = require("./util/files.js").listSupportFiles;

    const TOOLS = resolve(__dirname, "../../../tools");

    const testJs = `build/${format}/test`;
    const defaultSpec = `${testJs}/**/*Test.js`;

    // Build.  Ideally we'd import build code but it's asynchronous and mocharc isn't.  So instead build in a separate
    // process
    const spawnSync = require("child_process").spawnSync;
    const result = spawnSync(`${TOOLS}/bin/build.js`, [format], { stdio: "inherit" });
    if (result.error) {
        console.error(result.error);
        process.exit(-1);
    }

    // Hook Mocha so we can futz with args
    const main = cli.main;
    cli.main = function (argv, args) {
        const spec = args._;

        // Remove wildcard test selection if there's an input file
        if (spec.length > 1 && spec[spec.length - 1] === defaultSpec) {
            spec.length = spec.length - 1;
        }

        // Map input files to the compiled test
        for (let i = 0; i < spec.length; i++) {
            let path = spec[i];

            // Convenience - map src/ file to test equivalent
            path = path.replace(/src\/(.*)(\.[jt]s)/, "test/$1Test$2");

            // Map ts files to compiled equivalent
            path = path.replace(/test\/(.*)\.ts/, `${testJs}/$1.js`);

            spec[i] = path;
        }

        main.call(this, argv, args);
    };

    return {
        inlineDiffs: true,
        file: listSupportFiles(format),
        spec: [defaultSpec],
    };
}

module.exports.mocharc = mocharc;
