/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ignoreErrorSync } from "./errors.js";

function isNotFoundError(e: unknown) {
    return typeof e === "object" && e !== null && "code" in e && (e.code === "ENOENT" || e.code === "ENOTDIR");
}

export function maybeStatSync(path: string) {
    try {
        return statSync(path);
    } catch (e) {
        if (isNotFoundError(e)) {
            return;
        }
        throw e;
    }
}

export function maybeReadJsonSync(path: string) {
    try {
        return JSON.parse(readFileSync(path, "utf-8"));
    } catch (e) {
        if (isNotFoundError(e)) {
            return;
        }
        if (e instanceof SyntaxError) {
            e.message = `Error parsing ${path}: ${e.message}`;
            throw e;
        }
        throw e;
    }
}

export function maybeReaddirSync(path: string) {
    try {
        return readdirSync(path);
    } catch (e) {
        if (isNotFoundError(e)) {
            return;
        }
    }
}

export function isDirectory(path: string) {
    return !!ignoreErrorSync("ENOENT", () => statSync(path).isDirectory());
}

export function isFile(path: string) {
    return !!ignoreErrorSync("ENOENT", () => statSync(path).isFile());
}

/**
 * Tiny virtual filesystem driver.  Currently used only for processing globs.
 */
export interface FilesystemSync<T extends FilesystemSync.Stat = FilesystemSync.Stat> {
    resolve(...segments: string[]): string;
    readdir(path: string): string[] | undefined;
    stat(path: string): T | undefined;
}

export function FilesystemSync(): FilesystemSync<FilesystemSync.Stat> {
    return {
        resolve(...segments) {
            return resolve(...segments);
        },

        readdir(path) {
            return maybeReaddirSync(path);
        },

        stat(path) {
            const stats = maybeStatSync(path);
            if (stats) {
                return {
                    get isFile() {
                        return stats.isFile();
                    },

                    get isDirectory() {
                        return stats.isDirectory();
                    },
                };
            }
        },
    };
}

export namespace FilesystemSync {
    export interface Stat {
        isDirectory?: boolean;
        isFile?: boolean;
    }
}
