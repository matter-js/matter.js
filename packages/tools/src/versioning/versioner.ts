/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from "node:fs";
import { cp, writeFile } from "node:fs/promises";
import { ansi } from "../ansi-text/text-builder.js";
import { Graph } from "../building/graph.js";
import { execute } from "../running/execute.js";
import { Package } from "../util/package.js";
import { Progress } from "../util/progress.js";

const VERSION_FILE = "version.txt";

export class Versioner {
    #pkg: Package;
    #version?: string;
    #members = new Set<string>();

    get pkg() {
        return this.#pkg;
    }

    get version() {
        return this.#version;
    }

    get appliedVersion() {
        return this.#pkg.json.version;
    }

    constructor(pkg: Package, version?: string) {
        this.#pkg = pkg.workspace;

        if (version === undefined) {
            version = this.#readVersion();
        }

        if (version && !version.match(/^(?:\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?|[a-z]+)$/)) {
            throw new Error(`Version ${version} is invalid (must be semantic or single lowercase word)`);
        }

        this.#version = version;
    }

    async set() {
        await writeFile(this.#versionFile, this.#definiteVersion);
    }

    async apply(progress?: Progress) {
        const graph = await Graph.load(this.#pkg);
        this.#members = new Set(graph.nodes.map(node => node.pkg.name));

        for (const node of graph.nodes) {
            const what = `Apply ${ansi.bold(this.#definiteVersion)} to ${ansi.bold(node.pkg.name)}`;
            progress?.update(what);
            if (this.#applyOne(node.pkg)) {
                progress?.success(what);
                await node.pkg.save();
            } else {
                progress?.success(`${what} (no change)`);
            }
            await cp(this.#pkg.resolve("LICENSE"), node.pkg.resolve("LICENSE"));
        }
    }

    async tag() {
        await execute("git", ["tag", "-f", `v${this.#definiteVersion}`]);
    }

    get #definiteVersion() {
        if (this.#version === undefined) {
            throw new Error(`No version supplied and ${this.#versionFile} does not exist`);
        }
        return this.#version;
    }

    get #versionFile() {
        return this.#pkg.resolve(VERSION_FILE);
    }

    #readVersion() {
        const versionFile = this.#versionFile;
        if (!existsSync(versionFile)) {
            return undefined;
        }

        const version = readFileSync(versionFile).toString().trim();
        if (version.length === 0) {
            throw new Error(`Version file ${versionFile} is empty`);
        }

        return version;
    }

    #applyOne(pkg: Package) {
        const json = pkg.json;
        let changed = false;

        if (json.version !== this.#definiteVersion) {
            json.version = this.#definiteVersion;
            changed = true;
        }

        for (const key in json) {
            if (key !== "dependencies" && !key.endsWith("Dependencies")) {
                continue;
            }

            const deps = json[key];
            if (typeof deps !== "object") {
                continue;
            }

            if (this.#applyToDeps(deps as Record<string, string>)) {
                changed = true;
            }
        }

        return changed;
    }

    #applyToDeps(deps: Record<string, string>) {
        let changed = false;
        const version = this.#definiteVersion;
        for (const key in deps) {
            if (this.#members.has(key)) {
                if (deps[key] === version) {
                    continue;
                }
                deps[key] = this.#definiteVersion;
                changed = true;
            }
        }
        return changed;
    }
}
