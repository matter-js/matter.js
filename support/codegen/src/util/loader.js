/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This is a Node loader that adds TypeScript support (via ts-node's ESM
// loader) and adds our generated source files to the source path.  This is
// necessary because ts-node currently doesn't support multiple source roots.

// Actually not necessary because we decided to stick generated files under
// src/ ... leaving this for future reference though

import { promises as fs } from "fs";
import { relative } from "path";
import { createEsmHooks, register } from "ts-node";
import { URL } from "url";

const tsNode = register();
const tsnHooks = createEsmHooks(tsNode);

const FLAGGED_PATH_SEGMENT = "/packages/matter.js/";
const SRC = `${FLAGGED_PATH_SEGMENT}/src/`;
const GEN = `${FLAGGED_PATH_SEGMENT}/gen/`;

async function exists(url) {
    try {
        await fs.access(url);
        return true;
    } catch {
        return false;
    }
}

async function map(url, from, to) {
    if (url.toString().indexOf(from)) {
        url = new URL(url.toString().replace(from, to));
        if (await exists(url)) {
            return url;
        }
    }
}

export async function resolve(specifier, context, nextResolve) {
    if (context.parentURL && context.parentURL.indexOf(FLAGGED_PATH_SEGMENT) !== -1) {
        const parentURL = new URL(context.parentURL);
        const url = new URL(specifier, parentURL);
        if (!(await exists(url))) {
            let mapped;
            mapped = await map(url, SRC, GEN);
            if (!mapped) {
                mapped = await map(url, GEN, SRC);
            }
            if (mapped) {
                console.log(`${specifier} -> ${relative(parentURL.pathname, mapped.pathname)}`);
                specifier = relative(parentURL.pathname, mapped.pathname);
            }
        }
    }

    return tsnHooks.resolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
    return tsnHooks.load(url, context, nextLoad);
}
