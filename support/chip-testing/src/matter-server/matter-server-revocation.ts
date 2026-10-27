/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Makes the server read every `*.json` in the directory it names, each a revocation set as the CHIP SDK's
 * `generate_revocation_set.py` writes it, and install them before its WebSocket API accepts requests.
 */
export const REVOCATION_SETS_DIR_FLAG = "--revocation-sets-dir";

/** The directory in the server's storage the adapter passes with {@link REVOCATION_SETS_DIR_FLAG}. */
export const REVOCATION_SETS_DIR = "revocation-sets";

/** The one file the adapter writes there. */
export const REVOCATION_SET_FILE = "revocation-set.json";

/**
 * The NOTICE the server logs once it installed at least one file from the directory (logger
 * `MatterServer.RevocationSets`). Its wording is a contract of the server's `loadRevocationSets`; adjust it here when
 * that changes.
 */
export const REVOCATION_SETS_LOADED_LINE = /Loaded revocation sets from (.+): (\d+) files?, (\d+) entr(?:y|ies)/;

/** The levels at which the server reports a file or a directory it could not install from. */
const REFUSAL_LEVEL = /\b(?:ERROR|FATAL)\b/;

/** What every such line names: `Skipped revocation set <file>: …`, `Revocation sets directory <dir> does not exist…`. */
const REFUSAL_SUBJECT = /\brevocation sets?\b/i;

export interface RevocationSetsLoaded {
    dir: string;
    files: number;
    entries: number;
}

/** What a server line says it loaded, or `undefined` for any other line. */
export function revocationSetsLoadedOf(line: string): RevocationSetsLoaded | undefined {
    const match = REVOCATION_SETS_LOADED_LINE.exec(line);
    if (match === null) {
        return undefined;
    }
    const [, dir, files, entries] = match;
    return { dir, files: Number(files), entries: Number(entries) };
}

/**
 * The line the server refused {@link REVOCATION_SET_FILE} or its directory with, or `undefined` for any other line.
 * The server goes on starting after such a line, without the set.
 */
export function revocationSetRefusalOf(line: string): string | undefined {
    return REFUSAL_LEVEL.test(line) && REFUSAL_SUBJECT.test(line) ? line : undefined;
}
