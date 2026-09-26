/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#general";
import { Package } from "#tools";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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

function normalizeBody(body: any): string | Buffer {
    if (Buffer.isBuffer(body)) {
        return body;
    }
    return body.toString();
}

function hashOf(body: string | Buffer) {
    return createHash("md5").update(body).digest("hex");
}

function currentHashOf(path: string) {
    try {
        return hashOf(readFileSync(path));
    } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") {
            throw e;
        }
    }
}

const TEMP_SUFFIX = `.tmp-${process.pid}`;

function tempPathFor(path: string) {
    return `${path}${TEMP_SUFFIX}`;
}

function discardTemp(path: string) {
    try {
        unlinkSync(tempPathFor(path));
    } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") {
            throw e;
        }
    }
}

/**
 * Identifies a file by what the filesystem calls it rather than by the path we used to reach it.
 *
 * A path string is not an identity: on a case-insensitive volume `renameSync` onto an existing entry keeps that
 * entry's original spelling, so a file we just wrote can come back from `readdirSync` under a name that does not
 * match the path we wrote it to. Comparing strings would then classify our own output as stale and delete it.
 */
function identityOf(path: string) {
    try {
        const { dev, ino } = statSync(path);
        return `${dev}:${ino}`;
    } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") {
            throw e;
        }
    }
}

/**
 * Write the new content to a temporary sibling, or report that the file already holds it.
 *
 * Compilation is slowest part of our toolchain so it's worth the expense to compare old and new files so we can avoid
 * updating timestamps.
 */
function stageIfChanged(path: string, body: any) {
    mkdirSync(dirname(path), { recursive: true });

    body = normalizeBody(body);

    if (currentHashOf(path) === hashOf(body)) {
        return false;
    }

    writeFileSync(tempPathFor(path), body);

    return true;
}

function writeNow(path: string, body: any) {
    if (!stageIfChanged(path, body)) {
        return false;
    }

    try {
        renameSync(tempPathFor(path), path);
    } catch (e) {
        discardTemp(path);
        throw e;
    }

    return true;
}

function isGenerated(name: string, suffix: string) {
    return name.endsWith(`${suffix}.ts`) || name.endsWith(`${suffix}.js`);
}

/**
 * Remove generated files the current run did not produce, plus any temporary file a previous run was killed before it
 * could rename into place.
 */
function removeStale(dir: string, suffix: string, keep?: Set<string>) {
    const removed = Array<string>();
    try {
        for (const name of readdirSync(dir)) {
            const path = resolve(dir, name);

            // Only our own, so a concurrent run's staged file is not deleted before it can rename it.  That is the
            // extent of it: two generators writing one tree is not supported, and the sweep below can still delete
            // output another run committed.
            if (name.endsWith(TEMP_SUFFIX)) {
                if (isGenerated(name.slice(0, -TEMP_SUFFIX.length), suffix)) {
                    unlinkSync(path);
                }
                continue;
            }

            if (/\.tmp-\d+$/.test(name)) {
                continue;
            }

            if (!isGenerated(name, suffix)) {
                continue;
            }

            const identity = identityOf(path);
            if (identity !== undefined && keep?.has(identity)) {
                continue;
            }

            unlinkSync(path);
            removed.push(path);
        }
    } catch (e) {
        if ((e as { code?: string }).code !== "ENOENT") {
            throw e;
        }
    }
    return removed;
}

/**
 * Buffers a generation run's output so nothing reaches disk until the run is known to have succeeded.
 *
 * Without this, a generator that throws partway leaves a half-regenerated tree: the {@link clean} calls have already
 * deleted the previous output and only some of the replacement exists. That state compiles inconsistently, and a
 * regeneration diff taken against it says nothing about what the specification actually changed.
 *
 * Commit is not itself a single atomic operation. It writes every new file to a temporary sibling first and only then
 * renames them into place, so a failure while writing leaves the previous output untouched. A failure during the
 * rename pass can still leave some files new and some old — every file is individually complete and valid, but the
 * tree is a mixture. That window is the residual risk, and it is a few hundred renames rather than a full generation
 * pass.
 *
 * One process at a time. A second generator writing the same directories can have its committed output swept by the
 * first, because the sweep recognises output by the inodes it wrote and nothing arbitrates between runs.
 */
export class OutputSession {
    static #current: OutputSession | undefined;

    #files = new Map<string, string | Buffer>();
    #sweeps = new Array<{ dir: string; suffix: string }>();
    #closed = false;

    static get current() {
        return OutputSession.#current;
    }

    static open() {
        if (OutputSession.#current) {
            throw new InternalError("An output session is already open; generators run one at a time");
        }
        const session = new OutputSession();
        OutputSession.#current = session;
        return session;
    }

    stage(path: string, body: any) {
        this.#assertOpen();
        this.#files.set(path, normalizeBody(body));
    }

    /**
     * Record that {@link dir} holds generated output. On commit, any matching file the run did not produce is removed.
     * Deletion happens after the new content is written, so the previous output survives a failed run intact.
     */
    sweep(dir: string, suffix: string) {
        this.#assertOpen();
        this.#sweeps.push({ dir, suffix });
    }

    commit() {
        this.#assertOpen();
        this.#closed = true;
        OutputSession.#current = undefined;

        // Phase one: every new file is written beside its target, so a failure here leaves the previous output whole
        const written = Array<string>();
        try {
            for (const [path, body] of this.#files) {
                if (stageIfChanged(path, body)) {
                    written.push(path);
                }
            }

            // Phase two: nothing left to compute, so only the renames themselves can fail
            for (const path of written) {
                renameSync(tempPathFor(path), path);
            }
        } catch (e) {
            // Every staged path, not only those we recorded: the file being written when the throw arrived has a
            // partial temporary too, and its suffix names this process, so no later run would collect it
            for (const path of this.#files.keys()) {
                discardTemp(path);
            }
            throw e;
        }

        // Identity rather than path, because the name a file answers to is the filesystem's to decide
        const keep = new Set<string>();
        for (const path of this.#files.keys()) {
            const identity = identityOf(path);
            if (identity !== undefined) {
                keep.add(identity);
            }
        }

        const removed = Array<string>();
        for (const { dir, suffix } of this.#sweeps) {
            removed.push(...removeStale(dir, suffix, keep));
        }

        return { written: written.length, unchanged: this.#files.size - written.length, removed: removed.length };
    }

    /**
     * Abandon the run. Nothing staged reaches disk, so the previous output is left exactly as it was.
     */
    discard() {
        this.#closed = true;
        this.#files.clear();
        this.#sweeps.length = 0;
        if (OutputSession.#current === this) {
            OutputSession.#current = undefined;
        }
    }

    [Symbol.dispose]() {
        if (!this.#closed) {
            this.discard();
        }
    }

    #assertOpen() {
        if (this.#closed) {
            throw new InternalError("Output session is closed");
        }
    }
}

export function writeMatterFile(path: string, body: any) {
    path = absolute(path);

    const session = OutputSession.current;
    if (session) {
        session.stage(path, body);
        return;
    }

    writeNow(path, body);
}

export function clean(target: string, suffix = "") {
    const path = absolute(target);

    const session = OutputSession.current;
    if (session) {
        session.sweep(path, suffix);
        return;
    }

    removeStale(path, suffix);
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
