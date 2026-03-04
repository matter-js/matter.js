/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { minimatch } from "minimatch";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FENCED_BLOCK_RE = /(```\w+\n)(\/\/ .+\n)[\s\S]*?(```)/g;

export function main() {
    const patterns = process.argv.slice(2);
    if (!patterns.length) {
        console.error("Usage: matter-embed-examples <glob...>");
        process.exit(1);
    }

    const allFiles = readdirSync(".", { recursive: true, encoding: "utf-8" });
    const files = allFiles.filter(f => patterns.some(p => minimatch(f, p)));

    let totalEmbedded = 0;

    for (const file of files) {
        const original = readFileSync(file, "utf-8");
        const dir = dirname(resolve(file));

        const updated = original.replace(
            FENCED_BLOCK_RE,
            (_match, open: string, commentLine: string, close: string) => {
                const srcPath = commentLine.replace(/^\/\/\s*/, "").trimEnd();
                const absolute = resolve(dir, srcPath);

                let content: string;
                try {
                    content = readFileSync(absolute, "utf-8");
                } catch (e) {
                    console.error(`  ${file}: cannot read ${srcPath}: ${e}`);
                    return _match;
                }

                totalEmbedded++;
                return `${open}${commentLine}\n${content.trimEnd()}\n${close}`;
            },
        );

        if (updated !== original) {
            writeFileSync(file, updated);
            console.log(`  Updated ${file}`);
        }
    }

    if (totalEmbedded) {
        console.log(`Embedded ${totalEmbedded} example(s)`);
    }
}
