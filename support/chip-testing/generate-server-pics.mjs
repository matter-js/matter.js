#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Writes src/cert/matter-server-pics.ts from the PICS XML files of matterjs-server's certification
// declaration (a zip with one folder per endpoint). A key declared on several endpoints is supported where any
// endpoint supports it.
//
// Run via: `node support/chip-testing/generate-server-pics.mjs <declaration>.zip` (needs `unzip` on the PATH)

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const zip = process.argv[2];
if (zip === undefined) {
    console.error("Usage: generate-server-pics.mjs <declaration>.zip");
    process.exit(1);
}

const target = join(dirname(fileURLToPath(import.meta.url)), "src/cert/matter-server-pics.ts");

const extracted = mkdtempSync(join(tmpdir(), "server-pics-"));
try {
    execFileSync("unzip", ["-q", zip, "-d", extracted]);
    const values = readDeclaration(extracted);
    writeFileSync(target, render(values));
    console.log(`${Object.keys(values).length} keys, ${Object.values(values).filter(Boolean).length} supported`);
} finally {
    rmSync(extracted, { recursive: true, force: true });
}

function readDeclaration(directory) {
    const values = new Map();
    for (const file of xmlFiles(directory)) {
        const xml = readFileSync(file, "utf-8");
        const inFile = new Map();
        for (const [, item] of xml.matchAll(/<picsItem\b[^>]*>([\s\S]*?)<\/picsItem>/g)) {
            const key = item.match(/<itemNumber>\s*([^<\s]+)\s*<\/itemNumber>/)?.[1];
            const support = item.match(/<support>\s*(true|false)\s*<\/support>/i)?.[1];
            if (key === undefined || support === undefined) {
                throw new Error(`PICS item without an item number or a true/false support value in ${file}`);
            }
            const supported = support.toLowerCase() === "true";
            if (inFile.has(key) && inFile.get(key) !== supported) {
                throw new Error(`PICS item ${key} is declared both supported and unsupported in ${file}`);
            }
            inFile.set(key, supported);
            values.set(key, (values.get(key) ?? false) || supported);
        }
    }
    if (values.size === 0) {
        throw new Error(`No PICS items found in ${zip}`);
    }
    return Object.fromEntries([...values].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function xmlFiles(directory) {
    return readdirSync(directory, { recursive: true })
        .filter(name => name.toLowerCase().endsWith(".xml") && !basename(name).startsWith("."))
        .map(name => join(directory, name));
}

function render(values) {
    const entries = Object.entries(values)
        .map(([key, supported]) => `    "${key}": ${supported ? 1 : 0},`)
        .join("\n");
    return `/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { PicsValues } from "@matter/testing";

/**
 * Every PICS item of matterjs-server's certification declaration. A key declared on several endpoints is supported
 * where any endpoint supports it.
 *
 * Regenerate with \`node support/chip-testing/generate-server-pics.mjs <declaration>.zip\`.
 */
export const MATTERJS_SERVER_PICS: PicsValues = {
${entries}
};
`;
}
