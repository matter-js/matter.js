/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { exit, stdout } from "node:process";
import { ensureCompiled } from "./ensure-compiled.js";
import { executeNode } from "./execute.js";

/**
 * Execute a script in a package that conforms to matter.js conventions.  This is primarily useful within a matter.js
 * development environment but should also work when installed via NPM.
 *
 * First we translate source filenames to the transpiled *.js equivalent.
 *
 * If the target script is in a package not installed via NPM we build the package.  If the package is an NPM workspace
 * under a top-level package we also build dependencies.
 *
 * We then run the script in a child process so we can enable source maps using node --source-maps.  You can disable
 * this by setting the environment variable MATTER_DIRECT_EXEC.
 */
export async function main(argv = process.argv) {
    let directExec = !!process.env.MATTER_DIRECT_EXEC;

    // Drop node and matter-run
    argv = argv.slice(2);

    const nodeArgv = Array<string>();

    // Process arguments to matter-run itself (very simple as of yet so just processing manually)
    while (argv[0][0] === "-") {
        const option = argv.shift()!;

        switch (option) {
            case "--clear":
                console.clear();
                break;

            case "--direct":
                directExec = true;
                break;

            case "--help":
                stdout.write(
                    "Usage: matter-run [--clear] [--direct] [-<NODE_OPT>]... <SCRIPT> [ARG]...\nRun a Node.js script with source map support and automatic transpilation of TypeScript.",
                );
                return;

            default:
                // Any option we don't recognize we pass to node
                nodeArgv.push(option);
                break;
        }
    }

    // Extract script name.  argv is then the script's args
    let script = argv.shift();

    if (script === undefined || script === "") {
        console.error("Error: Script name required");
        exit(1);
    }

    script = await realpath(resolve(script));
    const dir = dirname(script);

    const { format, pkg } = await ensureCompiled(dir);

    // Determine the actual script to run
    if (format !== "none") {
        script = pkg.resolve(
            pkg
                .relative(script)
                .replace(/\.ts$/, ".js")
                .replace(/^src[\\/]/, `dist/${format}/`),
        );
    }

    if (!existsSync(script)) {
        console.error(`Error: File not found: ${script}`);
        exit(2);
    }

    // If we run in the same process we cannot enable source maps so default mode is to fork.  However for development
    // purposes it can be useful to avoid the intermediary process.  In this case you can set "--enable-source-maps"
    // manually then set MATTER_DIRECT_EXEC
    if (directExec) {
        // This will not transpile properly to commonjs but we only use this module from ESM so that's OK
        await import(script);
    } else {
        // Our behavior in response to SIGINT should mirror the child process's.  So ignore the signal locally, only
        // quitting once the child process does
        process.on("SIGINT", () => {});
        process.on("SIGTERM", () => {});

        process.exitCode = await executeNode(script, argv, nodeArgv);
    }
}
