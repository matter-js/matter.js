/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Package } from "#tools";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative as nodeRelative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Paths we read/write must be defined here
const DIR_MAPPING = {
    "!cache": Package.workspace.resolve("codegen/.cache"),
    "!intermediate": Package.workspace.resolve("support/models/src"),
    "!types": Package.workspace.resolve("packages/types/src"),
    "!clusters": Package.workspace.resolve("packages/types/src/clusters"),
    "!globals": Package.workspace.resolve("packages/types/src/globals"),
    "!model": Package.workspace.resolve("packages/model/src"),
    "!elements": Package.workspace.resolve("packages/model/src/standard/elements"),
    "!resources": Package.workspace.resolve("packages/model/src/standard/resources"),
    "!node": Package.workspace.resolve("packages/node/src/"),
    "!behaviors": Package.workspace.resolve("packages/node/src/behaviors"),
    "!tags": Package.workspace.resolve("packages/node/src/tags"),
} as { [dirname: string]: string | undefined };

export function absolute(path: string) {
    if (isAbsolute(path)) {
        return path;
    }
    const slashAt = path.indexOf("/");
    let dirId, file;
    if (slashAt == -1) {
        dirId = path;
        file = undefined;
    } else {
        dirId = path.substring(0, slashAt);
        file = path.substring(slashAt + 1);
    }
    if (!dirId.startsWith("!")) {
        throw new Error(`Relative path "${path}" does not have a ! prefix`);
    }
    const dir = DIR_MAPPING[dirId];
    if (!dir) {
        throw new Error(`Unsupported ! prefix for "${path}"`);
    }
    if (file) {
        path = `${dir}/${file}`;
    } else {
        path = dir;
    }

    return resolve(dirname(fileURLToPath(import.meta.url)), path);
}

export function relative(from: string, to: string) {
    return nodeRelative(absolute(from), absolute(to));
}

export function readMatterFile(path: string, encoding: BufferEncoding = "utf-8") {
    return readFileSync(absolute(path), { encoding: encoding });
}

export function writeMatterFile(path: string, body: any) {
    path = absolute(path);
    mkdirSync(dirname(path), { recursive: true });

    let currentHash: string | undefined;

    try {
        currentHash = createHash("md5").update(readFileSync(path)).digest("hex");
    } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") {
            throw e;
        }
    }

    if (!(body instanceof Buffer && !ArrayBuffer.isView(body))) {
        body = body.toString();
    }

    // Compilation is slowest part of our toolchain so it's worth the expense to compare old and new files so we can
    // avoid updating timestamps
    const newHash = createHash("md5").update(body).digest("hex");
    if (currentHash === newHash) {
        return;
    }

    writeFileSync(path, body);
}

export function clean(target: string, suffix = "") {
    const path = absolute(target);
    try {
        readdirSync(path).forEach(f => {
            if (f.endsWith(`${suffix}.ts`)) {
                unlinkSync(resolve(path, f));
            }
        });
    } catch (e) {
        if ((e as { code?: string }).code === "ENOENT") {
            return;
        }
        throw e;
    }
}

export async function readFileWithCache(name: string, generator: (name: string) => Promise<string>) {
    name = `!cache/${name}`;
    try {
        return readMatterFile(name);
    } catch (e) {
        // Cache unavailable
    }

    const text = await generator(name);
    writeMatterFile(name, text);

    return text;
}
