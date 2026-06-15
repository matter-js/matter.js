#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stamps the runtime version constant for @matter/main.
 *
 * Reads the target version from argv[2] or, if absent, from version.txt at
 * repo root. Replaces the literal "0.0.0-git" with the stamped value in:
 *   - packages/main/src/version.ts
 *   - packages/main/dist/esm/version.js
 *   - packages/main/dist/cjs/version.js
 *
 * Each target file must contain the placeholder exactly once. If the
 * placeholder is missing, the script exits non-zero — that means a prior
 * run already stamped the tree (or the file shape changed unexpectedly).
 *
 * The script is invoked by the release workflow only. Local developers
 * never run it.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PLACEHOLDER = "0.0.0-git";
const VERSION_RE = /^(?:\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?|[a-z]+)$/;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
    "packages/main/src/version.ts",
    "packages/main/dist/esm/version.js",
    "packages/main/dist/cjs/version.js",
];

async function readTargetVersion() {
    if (process.argv[2]) {
        return process.argv[2].trim();
    }
    const text = await readFile(resolve(repoRoot, "version.txt"), "utf8");
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error("version.txt is empty");
    }
    return trimmed;
}

async function stamp(relPath, version) {
    const abs = resolve(repoRoot, relPath);
    const original = await readFile(abs, "utf8");
    const literal = `"${PLACEHOLDER}"`;
    const occurrences = original.split(literal).length - 1;
    if (occurrences !== 1) {
        throw new Error(
            `Expected exactly one occurrence of ${literal} in ${relPath}, found ${occurrences}. ` +
                `Either the placeholder was already stamped or the file shape changed.`,
        );
    }
    const updated = original.replace(literal, `"${version}"`);
    await writeFile(abs, updated);
    console.log(`stamped ${relPath} -> ${version}`);
}

async function main() {
    const version = await readTargetVersion();
    if (!VERSION_RE.test(version)) {
        throw new Error(`Version ${version} is invalid (must match ${VERSION_RE}).`);
    }
    for (const target of TARGETS) {
        await stamp(target, version);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
