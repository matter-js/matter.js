/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Bootstrap tooling code.  Libraries are unavailable here; we may only use 3rd party modules.
//
// Also do not use TS as it would require the code invoking bootstrap to do a meta-bootstrap. 🙄

import { spawn } from "child_process";
import { cp, stat } from "fs/promises";
import { platform } from "os";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

function fatal(why, error) {
    console.error(`Cannot bootstrap matter.js tooling because ${why}.`);
    if (error) {
        console.error(error);
    }
    process.exit(1);
}

async function findFile(name) {
    let dir = dirname(fileURLToPath(import.meta.url));
    while (true) {
        if (!dir.endsWith("/dist/esm")) {
            const path = resolve(dir, name);
            try {
                await stat(path);
                return path;
            } catch (e) {
                if (e.code !== "ENOENT") {
                    fatal("there was an unexpected error searching the filesystem", e);
                }
            }
        }

        const nextDir = dirname(dir);
        if (nextDir === dir) {
            break;
        }

        dir = nextDir;
    }
}

async function bootstrap() {
    try {
        const pkg = await findFile("package.json");
        if (pkg === undefined) {
            fatal("the bootstrap script does not appear to be installed in a package");
        }

        const path = dirname(pkg);

        const options = {
            stdio: "inherit",
            cwd: path,
        };

        if (platform() === "win32") {
            options.shell = true;
        }

        let esbuild = await findFile("node_modules/.bin/esbuild");
        if (esbuild === undefined) {
            // As a last resort, attempt to rely on the system PATH
            esbuild = "esbuild";
        }

        await new Promise(resolve => {
            const proc = spawn(
                esbuild,
                [
                    "src/**/*.ts",
                    "--outdir=dist/esm",
                    "--format=esm",
                    "--log-level=warning",
                    "--sourcemap=inline",
                    "--target=es2022",
                ],
                options,
            );

            proc.on("error", e => {
                if (e.code === "ENOENT") {
                    fatal(
                        'esbuild is not found.\nYou probably need to run "npm install" in the root of the repository',
                    );
                }
                fatal("an unexpected error occurred running esbuild", e);
            });

            proc.on("close", code => {
                if (code === 0) {
                    resolve();
                } else {
                    fatal(`esbuild exited with code ${code}`);
                }
            });
        });

        await cp(resolve(path, "src/util/tools-path.cjs"), resolve(path, "dist/esm/util/tools-path.cjs"));
    } catch (e) {
        fatal("an unexpected error occurred", e);
    }
}

// If installed then we assume we're compiled and boostrap is a no-op
if (!import.meta.url.match(/[\\/]node_modules[\\/]/)) {
    await bootstrap();
}
