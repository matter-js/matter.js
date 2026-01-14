/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const MAX_CYCLES = 1000;

import { readFile } from "node:fs/promises";
import { Package } from "../util/package.js";
import { Progress } from "../util/progress.js";

// @ts-expect-error we don't have types for detective-typescript
import detective from "detective-typescript";
import { dirname, relative, resolve } from "node:path";
import { std } from "../ansi-text/std.js";
import { ansi } from "../ansi-text/text-builder.js";

export async function reportCycles(pkg: Package, progress: Progress) {
    const cycles = await progress.run(pkg.name, () => identifyCycles(pkg, progress));
    if (cycles) {
        printCycles(pkg, cycles);
    }
}

async function identifyCycles(pkg: Package, progress: Progress) {
    const deps = {} as Record<string, string[]>;
    for (const filename of await pkg.glob("{src,test}/**/*.ts")) {
        const contents = await readFile(filename, "utf-8");
        const fileDeps = detective(contents, {
            skipTypeImports: true,
            skipAsyncImports: true,
        });
        deps[filename] = resolveDeps(pkg, filename, fileDeps);
    }

    const cycles = [] as string[][];
    for (const filename in deps) {
        visit(filename, []);
        if (cycles.length === MAX_CYCLES) {
            break;
        }
    }

    function visit(filename: string, breadcrumb: string[]) {
        progress.refresh();
        const fileDeps = deps[filename] ?? deps[filename.replace(/\.js$/, ".ts")];
        if (fileDeps === undefined) {
            return;
        }

        const previousIndex = breadcrumb.indexOf(filename);
        if (previousIndex !== -1) {
            const newCycle = breadcrumb.slice(previousIndex);
            for (const cycle of cycles) {
                const filenameOffset = cycle.indexOf(filename);
                if (cycle.length !== newCycle.length) {
                    continue;
                }
                if (filenameOffset === -1) {
                    continue;
                }

                let i = 0;
                for (i = 0; i < newCycle.length; i++) {
                    if (newCycle[i] !== cycle[(filenameOffset + i) % newCycle.length]) {
                        break;
                    }
                }

                if (i === newCycle.length) {
                    return;
                }
            }
            cycles.push(newCycle);
            return;
        }

        breadcrumb = [...breadcrumb, filename];
        for (const dep of fileDeps) {
            visit(dep, breadcrumb);
            if (cycles.length > MAX_CYCLES) {
                break;
            }
        }
    }

    return cycles.length ? cycles : undefined;
}

function printCycles(pkg: Package, cycles: string[][]) {
    std.out(ansi.red("Cycles detected:"), "\n");
    const src = pkg.resolve("src");
    for (const cycle of cycles) {
        std.out("  ", cycle.map(name => ansi.bright.blue(relative(src, name))).join(" → "), " ↩\n");
    }
    if (cycles.length >= MAX_CYCLES) {
        std.out(`\n${ansi.red(`Stopping search after max ${MAX_CYCLES} cycles`)}\n`);
    }
}

function resolveDeps(pkg: Package, sourceFilename: string, deps: string[]) {
    const dir = dirname(sourceFilename);
    const aliases = pkg.importAliases;
    const resolved = Array<string>();

    for (let dep of deps) {
        let base = dir;
        if (dep.startsWith("#")) {
            dep = aliases.rewrite(dep);
            base = pkg.path;
        }
        if (dep.startsWith("./")) {
            resolved.push(resolve(base, dep));
        }
    }

    return resolved;
}
