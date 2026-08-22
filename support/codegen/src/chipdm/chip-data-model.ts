/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Logger, Minutes, Mutex } from "#general";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { absolute } from "../util/file.js";
import { DataModelSourceError } from "./errors.js";
import { compareVersions } from "./version.js";

const logger = Logger.get("chip-data-model");

const REPO_URL = "https://github.com/project-chip/connectedhomeip.git";
const CACHE_PATH = "!cache/chip-data-model";
const REF_FILE = ".ref";
const LOCK_SUFFIX = ".lock";
const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;
const COMMIT_PATTERN = /^[\da-f]{40}$/i;

/** A hung git leaves the tool with nothing to report, so every invocation is bounded */
const GIT_TIMEOUT = Minutes(5);

const run = promisify(execFile);

/**
 * A source of CHIP data model XML.
 *
 * CHIP publishes the Matter data model as curated XML under `data_model/<version>` of the connectedhomeip repository.
 * These files are the authority we validate our scraped model against.
 */
export interface ChipDataModel {
    /** Human readable description of the source including the exact revision, for the validation report */
    readonly description: string;

    /** Data model versions the source offers */
    versions(): Promise<string[]>;

    /** Absolute path of the directory holding XML for one version */
    directory(version: string): Promise<string>;

    /** Release the source, including any claim it holds on the shared download cache */
    [Symbol.asyncDispose](): Promise<void>;
}

export namespace ChipDataModel {
    export interface Options {
        /**
         * Path of a connectedhomeip checkout to read instead of downloading.  Either the repository root or its
         * `data_model` directory.
         */
        dir?: string;

        /** Branch or tag to download; the download is a single commit, so a bare commit ID is not a valid ref */
        ref?: string;

        /** Download again even if a cached download is present */
        refresh?: boolean;
    }

    /**
     * Obtain CHIP data model XML, downloading it if necessary.
     *
     * The download is a blobless, single-commit partial clone with only the `data_model` directories of interest
     * checked out.  This costs a few MB and no authentication, as opposed to several hundred authenticated requests
     * via the GitHub API.
     */
    export async function open(options: Options = {}): Promise<ChipDataModel> {
        if (options.dir !== undefined) {
            return await LocalCheckout.open(options.dir);
        }
        return await CachedDownload.open(options);
    }

    /**
     * Convert a Matter specification revision such as "1.6.0" into the CHIP data model directory name.
     *
     * CHIP omits a trailing zero patch level, matching {@link Specification.Revision}.
     */
    export function versionFor(revision: string) {
        const components = revision.split(".");
        if (components.length > 3) {
            components.length = 3;
        }
        if (components.length > 2 && components[2] === "0") {
            components.length = 2;
        }
        return components.join(".");
    }
}

async function git(cwd: string, ...args: string[]) {
    let stdout;
    try {
        ({ stdout } = await run("git", args, {
            cwd,
            encoding: "utf-8",
            timeout: GIT_TIMEOUT,

            // Without a terminal git would wait on the credential prompt until the timeout rather than failing
            env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        }));
    } catch (cause) {
        throw new DataModelSourceError(
            timedOut(cause)
                ? `git ${args.join(" ")} in ${cwd} exceeded ${Duration.format(GIT_TIMEOUT)}`
                : `git ${args.join(" ")} failed in ${cwd}`,
            { cause },
        );
    }
    return stdout.trim();
}

/** The child is also killed when it outstrips `maxBuffer`, which is a different failure than a hung git */
function timedOut(cause: unknown) {
    if (!(cause instanceof Error) || !("killed" in cause) || cause.killed !== true) {
        return false;
    }
    return !("code" in cause) || cause.code !== "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}

async function isDirectory(path: string) {
    return (await stat(path).catch(() => undefined))?.isDirectory() === true;
}

async function dataModelDir(path: string) {
    if (await isDirectory(resolve(path, "data_model"))) {
        return resolve(path, "data_model");
    }
    if (
        (await isDirectory(resolve(path, "clusters"))) ||
        (await readdir(path)).some(entry => VERSION_PATTERN.test(entry))
    ) {
        return resolve(path);
    }
    throw new DataModelSourceError(`No data model XML in ${path}; expected a connectedhomeip checkout`);
}

class LocalCheckout implements ChipDataModel {
    readonly #path: string;
    readonly description: string;

    private constructor(path: string, revision?: string) {
        this.#path = path;
        this.description = revision === undefined ? path : `${path} (${revision})`;
    }

    static async open(dir: string) {
        const path = await dataModelDir(dir);

        let revision;
        try {
            revision = await git(path, "rev-parse", "--short", "HEAD");
        } catch {
            // Not a git checkout; the path alone identifies the source
        }

        return new LocalCheckout(path, revision);
    }

    async versions() {
        return (await readdir(this.#path)).filter(entry => VERSION_PATTERN.test(entry)).sort(compareVersions);
    }

    async directory(version: string) {
        const path = resolve(this.#path, version);
        if (!(await isDirectory(path))) {
            throw new DataModelSourceError(`${this.#path} has no data model for version ${version}`);
        }
        return path;
    }

    async [Symbol.asyncDispose]() {
        // A checkout we only read needs no cleanup
    }
}

class CachedDownload implements ChipDataModel {
    readonly #path: string;
    readonly #commit: string;
    readonly #committed: string;
    readonly #lock: CacheLock;
    readonly #checkout = new Set<string>();
    readonly #mutex = new Mutex(this);
    #populated = false;

    private constructor(path: string, commit: string, committed: string, lock: CacheLock) {
        this.#path = path;
        this.#commit = commit;
        this.#committed = committed;
        this.#lock = lock;
    }

    static async open({ ref = "master", refresh }: ChipDataModel.Options) {
        const path = absolute(CACHE_PATH);
        const marker = resolve(path, REF_FILE);

        // Checking a version out mutates the cache long after it is populated, so the claim is held for as long as
        // this source is in use rather than only while downloading
        const lock = await CacheLock.acquire(path);

        let populated = false;

        try {
            const source = await CachedDownload.#populate(path, marker, ref, refresh, lock);
            populated = true;
            return source;
        } finally {
            // The claim outlives this call only as part of the source it returns
            if (!populated) {
                await lock[Symbol.asyncDispose]().catch(cause =>
                    logger.warn(`Cannot release the claim on ${path}`, cause),
                );
            }
        }
    }

    static async #populate(path: string, marker: string, ref: string, refresh: boolean | undefined, lock: CacheLock) {
        if (refresh) {
            await rm(path, { force: true, recursive: true });
        } else {
            // The download is a single commit, so the cache is only good for the commit the ref pointed at when we
            // populated it; a branch that has moved since must download again.  A ref we could not resolve leaves the
            // cache in place, as there is nothing better to compare against
            const wanted = await resolvedCommit(ref);
            const cached = await readFile(marker, "utf-8").catch(() => undefined);

            if (wanted !== undefined && cached !== markerFor(ref, wanted)) {
                await rm(path, { force: true, recursive: true });
            }
        }

        let downloaded = false;
        if (await isDirectory(resolve(path, ".git"))) {
            logger.info(`Using cached CHIP data model download in ${path}`);
        } else {
            await mkdir(path, { recursive: true });
            logger.info(`Downloading CHIP data model ${ref} into ${path}`);
            await git(
                path,
                "clone",
                "--depth",
                "1",
                "--filter=tree:0",
                "--sparse",
                "--no-checkout",
                "--branch",
                ref,
                REPO_URL,
                ".",
            );
            downloaded = true;
        }

        const commit = await git(path, "rev-parse", "HEAD");
        const committed = await git(path, "log", "-1", "--format=%cs");

        // Only a download we performed establishes what the marker states
        if (downloaded) {
            await writeFile(marker, markerFor(ref, commit));
        }

        return new CachedDownload(path, commit, committed, lock);
    }

    get description() {
        return `project-chip/connectedhomeip@${this.#commit.slice(0, 9)} (${this.#committed})`;
    }

    async versions() {
        return (await git(this.#path, "ls-tree", "--name-only", "HEAD", "data_model/"))
            .split("\n")
            .map(line => line.replace(/^data_model\//, "").replace(/\/$/, ""))
            .filter(entry => VERSION_PATTERN.test(entry))
            .sort(compareVersions);
    }

    async directory(version: string) {
        return await this.#mutex.produce(() => this.#checkoutOf(version));
    }

    async [Symbol.asyncDispose]() {
        try {
            await this.#mutex.close();
        } finally {
            await this.#lock[Symbol.asyncDispose]();
        }
    }

    async #checkoutOf(version: string) {
        if (!this.#checkout.has(version)) {
            if (!(await this.versions()).includes(version)) {
                throw new DataModelSourceError(`CHIP ${this.description} has no data model for version ${version}`);
            }

            const wanted = [...this.#checkout, version];
            await git(this.#path, "sparse-checkout", "set", "--no-cone", ...wanted.map(v => `data_model/${v}`));

            if (!this.#populated) {
                await git(this.#path, "checkout", "--detach", this.#commit);
                this.#populated = true;
            }

            // Recorded only once the working tree holds the version, so a failure above leaves a retry able to repeat it
            this.#checkout.add(version);
        }

        const path = resolve(this.#path, "data_model", version);
        if (!(await isDirectory(path))) {
            throw new DataModelSourceError(`Checkout of CHIP data model ${version} produced no ${path}`);
        }

        return path;
    }
}

/**
 * An exclusive claim on the shared download cache.
 *
 * The claim is a sibling of the cache directory rather than a file inside it, so refreshing the cache cannot delete
 * the claim that guards the refresh.
 *
 * A claim is never taken from a running holder and never expires, because there is no upper bound on how long a
 * legitimate run takes.  Concurrent use therefore fails immediately rather than queueing; we accept that over a wait
 * that ends in comparing a working tree another run is still moving.
 */
class CacheLock {
    readonly #path: string;
    #held = true;

    private constructor(path: string) {
        this.#path = path;
    }

    static async acquire(cache: string) {
        const path = `${cache}${LOCK_SUFFIX}`;
        await mkdir(dirname(path), { recursive: true });

        // Two attempts: the second is for a claim the first found abandoned and cleared
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await writeFile(path, `${process.pid}`, { flag: "wx" });
                return new CacheLock(path);
            } catch (cause) {
                if (!isErrno(cause, "EEXIST")) {
                    throw new DataModelSourceError(`Cannot claim CHIP data model cache ${cache}`, { cause });
                }
            }

            const holder = await CacheLock.#holder(path);
            if (holder === undefined || isRunning(holder)) {
                throw new DataModelSourceError(
                    `Another run${holder === undefined ? "" : ` (pid ${holder})`} is using the CHIP data model cache ` +
                        `${cache}; wait for it to finish, or read a checkout of your own with --chip-dir`,
                );
            }

            await CacheLock.#discard(path, holder);
        }

        throw new DataModelSourceError(`Cannot claim CHIP data model cache ${cache}`);
    }

    /** The process ID a claim states, or undefined for a claim we cannot read or did not write */
    static async #holder(path: string) {
        const stated = await readFile(path, "utf-8").catch(() => undefined);
        const pid = stated === undefined ? NaN : Number(stated.trim());
        return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
    }

    /**
     * Clear the claim of a process that no longer exists.
     *
     * Renaming is atomic, so of several runs that find the same abandoned claim exactly one clears it and the rest see
     * `ENOENT`.  Deleting in place would instead let one run delete the claim another had just taken.
     */
    static async #discard(path: string, holder: number) {
        logger.warn(`Discarding the claim of pid ${holder} on the CHIP data model cache; that process is gone`);

        const discarded = `${path}.${process.pid}`;
        try {
            await rename(path, discarded);
        } catch (cause) {
            if (isErrno(cause, "ENOENT")) {
                return;
            }
            throw new DataModelSourceError(`Cannot discard the abandoned claim ${path}`, { cause });
        }

        await rm(discarded, { force: true });
    }

    async [Symbol.asyncDispose]() {
        if (!this.#held) {
            return;
        }
        this.#held = false;

        // Release only a claim that is still ours; another run may have discarded it and taken its own
        if ((await CacheLock.#holder(this.#path)) === process.pid) {
            await rm(this.#path, { force: true });
        }
    }
}

/** Whether a process exists; a signal we may not send still tells us it does */
function isRunning(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (cause) {
        return isErrno(cause, "EPERM");
    }
}

function isErrno(cause: unknown, code: string) {
    return cause instanceof Error && "code" in cause && cause.code === code;
}

function markerFor(ref: string, commit: string) {
    return `${ref} ${commit}`;
}

/**
 * The commit a ref names in the remote.
 *
 * Returns undefined when the remote cannot be reached, which leaves whatever the cache holds in place rather than
 * failing a run that has everything it needs.
 */
async function resolvedCommit(ref: string) {
    let output;
    try {
        // git peels a ref only where asked to, so the annotated-tag case needs the peeled pattern of its own
        output = await git(process.cwd(), "ls-remote", REPO_URL, ref, `${ref}^{}`);
    } catch (cause) {
        logger.warn(`Cannot reach ${REPO_URL}; using the cached download if there is one`, cause);
        return undefined;
    }

    const lines = output.split("\n").filter(line => line !== "");

    // An annotated tag resolves to the tag object; the peeled entry names the commit the clone will check out
    const line = lines.find(candidate => candidate.endsWith("^{}")) ?? lines[0];

    const commit = line?.split(/\s/, 1)[0].toLowerCase();
    if (commit === undefined || !COMMIT_PATTERN.test(commit)) {
        throw new DataModelSourceError(`${REPO_URL} has no branch or tag ${ref}`);
    }

    return commit;
}
