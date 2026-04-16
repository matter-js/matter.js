/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory, File, type Filesystem, type FilesystemNode, type MaybePromise } from "@matter/general";
import { rename as fsRename, mkdir, rm, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { nodeCopy, nodeEntries, nodeStat } from "./fs-utils.js";
import { acquireDirectoryLock } from "./lock-utils.js";
import { NodeJsFile } from "./NodeJsFile.js";

export class NodeJsDirectory extends Directory {
    readonly #fs: Filesystem;
    #path: string;
    #name: string;
    readonly #cachedStat?: FilesystemNode.Stat;

    constructor(fs: Filesystem, path: string, name: string, cachedStat?: FilesystemNode.Stat) {
        super();
        this.#fs = fs;
        this.#path = path;
        this.#name = name;
        this.#cachedStat = cachedStat;
    }

    override get fs() {
        return this.#fs;
    }

    get name() {
        return this.#name;
    }

    override get path() {
        return this.#path;
    }

    async exists(): Promise<boolean> {
        try {
            const s = await stat(this.#path);
            return s.isDirectory();
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                return false;
            }
            throw e;
        }
    }

    stat(): MaybePromise<FilesystemNode.Stat> {
        if (this.#cachedStat) {
            return this.#cachedStat;
        }
        return nodeStat(this.#path);
    }

    async rename(newName: string): Promise<void> {
        const newPath = resolve(dirname(this.#path), newName);
        await fsRename(this.#path, newPath);
        this.#path = newPath;
        this.#name = basename(newPath);
    }

    async delete(): Promise<void> {
        await rm(this.#path, { recursive: true, force: true });
    }

    async *entries(): AsyncIterable<Directory.Entry> {
        yield* nodeEntries(this.#fs, this.#path, NodeJsFile, NodeJsDirectory);
    }

    file(name: string): File {
        return new NodeJsFile(this.#fs, resolve(this.#path, name), name);
    }

    directory(name: string): Directory {
        return new NodeJsDirectory(this.#fs, resolve(this.#path, name), name);
    }

    async mkdir(): Promise<void> {
        await mkdir(this.#path, { recursive: true });
    }

    async copy(source: string | FilesystemNode, target: string | FilesystemNode): Promise<void> {
        await nodeCopy(this.#path, source, target);
    }

    override async lock(): Promise<() => Promise<void>> {
        await this.mkdir();
        return acquireDirectoryLock(this.#path, this.#name);
    }
}
