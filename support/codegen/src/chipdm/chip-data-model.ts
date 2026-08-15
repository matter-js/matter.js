/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#general";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { absolute } from "../util/file.js";
import { DataModelSourceError } from "./errors.js";

const logger = Logger.get("chip-data-model");

const REPO_URL = "https://github.com/project-chip/connectedhomeip.git";
const CACHE_PATH = "!cache/chip-data-model";
const REF_FILE = ".ref";
const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?$/;

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
}

export namespace ChipDataModel {
    export interface Options {
        /**
         * Path of a connectedhomeip checkout to read instead of downloading.  Either the repository root or its
         * `data_model` directory.
         */
        dir?: string;

        /** Branch, tag or commit to download */
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
            return new LocalCheckout(options.dir);
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

function compareVersions(a: string, b: string) {
    const left = a.split(".").map(Number);
    const right = b.split(".").map(Number);

    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const difference = (left[i] ?? 0) - (right[i] ?? 0);
        if (difference) {
            return difference;
        }
    }

    return 0;
}

function git(cwd: string, ...args: string[]) {
    try {
        return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch (cause) {
        throw new DataModelSourceError(`git ${args.join(" ")} failed in ${cwd}`, { cause });
    }
}

function dataModelDir(path: string) {
    if (existsSync(resolve(path, "data_model"))) {
        return resolve(path, "data_model");
    }
    if (existsSync(resolve(path, "clusters")) || readdirSync(path).some(entry => VERSION_PATTERN.test(entry))) {
        return resolve(path);
    }
    throw new DataModelSourceError(`No data model XML in ${path}; expected a connectedhomeip checkout`);
}

class LocalCheckout implements ChipDataModel {
    readonly #path: string;
    readonly description: string;

    constructor(dir: string) {
        this.#path = dataModelDir(dir);

        let revision;
        try {
            revision = git(this.#path, "rev-parse", "--short", "HEAD");
        } catch {
            // Not a git checkout; the path alone identifies the source
        }
        this.description = revision === undefined ? this.#path : `${this.#path} (${revision})`;
    }

    async versions() {
        return readdirSync(this.#path)
            .filter(entry => VERSION_PATTERN.test(entry))
            .sort(compareVersions);
    }

    async directory(version: string) {
        const path = resolve(this.#path, version);
        if (!existsSync(path)) {
            throw new DataModelSourceError(`${this.#path} has no data model for version ${version}`);
        }
        return path;
    }
}

class CachedDownload implements ChipDataModel {
    readonly #path: string;
    readonly #commit: string;
    readonly #committed: string;
    readonly #checkout = new Set<string>();
    #populated = false;

    private constructor(path: string, commit: string, committed: string) {
        this.#path = path;
        this.#commit = commit;
        this.#committed = committed;
    }

    static async open({ ref = "master", refresh }: ChipDataModel.Options) {
        const path = absolute(CACHE_PATH);
        const marker = resolve(path, REF_FILE);

        // The download is a single commit so a different ref, or a refresh of the same one, means downloading again
        if (refresh || (existsSync(marker) && readFileSync(marker, "utf-8") !== ref)) {
            rmSync(path, { force: true, recursive: true });
        }

        if (existsSync(resolve(path, ".git"))) {
            logger.info(`Using cached CHIP data model download in ${path}`);
        } else {
            mkdirSync(path, { recursive: true });
            logger.info(`Downloading CHIP data model ${ref} into ${path}`);
            git(
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
        }

        writeFileSync(marker, ref);

        const commit = git(path, "rev-parse", "HEAD");
        const committed = git(path, "log", "-1", "--format=%cs");

        return new CachedDownload(path, commit, committed);
    }

    get description() {
        return `project-chip/connectedhomeip@${this.#commit.slice(0, 9)} (${this.#committed})`;
    }

    async versions() {
        return git(this.#path, "ls-tree", "--name-only", "HEAD", "data_model/")
            .split("\n")
            .map(line => line.replace(/^data_model\//, "").replace(/\/$/, ""))
            .filter(entry => VERSION_PATTERN.test(entry))
            .sort(compareVersions);
    }

    async directory(version: string) {
        if (!this.#checkout.has(version)) {
            if (!(await this.versions()).includes(version)) {
                throw new DataModelSourceError(`CHIP ${this.description} has no data model for version ${version}`);
            }

            this.#checkout.add(version);
            git(this.#path, "sparse-checkout", "set", "--no-cone", ...[...this.#checkout].map(v => `data_model/${v}`));

            if (!this.#populated) {
                git(this.#path, "checkout", "--detach", this.#commit);
                this.#populated = true;
            }
        }

        const path = resolve(this.#path, "data_model", version);
        if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
            throw new DataModelSourceError(`Checkout of CHIP data model ${version} produced no ${path}`);
        }

        return path;
    }
}
