/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from "node:child_process";
import { cp } from "node:fs/promises";
import { join } from "path";
import { isDirectory } from "../../util/file.js";
import { Package } from "../../util/package.js";
import { BuildError } from "../error.js";
import { TypescriptContext } from "./context.js";

export function createTsgoContext(workspace: Package): TypescriptContext {
    const bin = join(workspace.resolve("node_modules", ".bin", "tsgo"));
    return {
        async build(pkg, path, _refreshCallback, emit) {
            const args = ["--project", path];

            if (emit === false) {
                args.push("--noEmit");
            }

            await new Promise<void>((resolve, reject) => {
                const tsgo = spawn(bin, args, { stdio: "inherit" });

                tsgo.on("exit", (code, signal) => {
                    switch (code) {
                        case 0:
                            resolve();
                            break;

                        case 1: // Diagnostics present, outputs generated
                        case 2: // Diagnostics present, outputs skipped
                        case 3: // Project invalid
                        case 4: // Reference cycle
                        case 5: // Not implemented
                            // TS will have printed an error already
                            reject(new BuildError());
                            break;

                        case null:
                            reject(new BuildError(`tsgo exited with signal ${signal}`));
                            break;

                        default:
                            reject(new BuildError(`tsgo exited with code ${code}`));
                            break;
                    }
                });
            });

            await cp(pkg.resolve("dist/esm"), pkg.resolve("dist/cjs"), {
                recursive: true,
                filter(src) {
                    if (isDirectory(src)) {
                        return true;
                    }

                    return src.endsWith(".d.ts") || src.endsWith(".d.ts.map");
                },
            });
        },
    };
}
