/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory, File, FileTypeError, Filesystem, type FilesystemNode } from "@matter/general";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { NodeJsDirectory } from "./NodeJsDirectory.js";
import { NodeJsFile } from "./NodeJsFile.js";
import { nodeCopy, nodeEntries, nodeExists, nodeStat } from "./fs-utils.js";

/**
 * Filesystem backed by the local OS filesystem via Node.js APIs.
 */
export class NodeJsFilesystem extends Filesystem {
    readonly #rootPath: string | (() => string);
    #tempCounter = 0;

    constructor(workingDirectory: string | (() => string)) {
        super();
        this.#rootPath = workingDirectory;
    }

    get name() {
        return "";
    }

    override get path() {
        return typeof this.#rootPath === "function" ? this.#rootPath() : this.#rootPath;
    }

    async exists(): Promise<boolean> {
        return nodeExists(this.path);
    }

    stat(): Promise<FilesystemNode.Stat> {
        return nodeStat(this.path);
    }

    rename(): Promise<void> {
        throw new FileTypeError("Cannot rename root");
    }

    async delete(): Promise<void> {
        await rm(this.path, { recursive: true, force: true });
    }

    async *entries(): AsyncIterable<Directory.Entry> {
        yield* nodeEntries(this, this.path, NodeJsFile, NodeJsDirectory);
    }

    file(name: string): File {
        return new NodeJsFile(this, resolve(this.path, name), name);
    }

    directory(name: string): Directory {
        return new NodeJsDirectory(this, resolve(this.path, name), name);
    }

    async mkdir(): Promise<void> {
        await mkdir(this.path, { recursive: true });
    }

    async copy(source: string | FilesystemNode, target: string | FilesystemNode): Promise<void> {
        await nodeCopy(this.path, source, target);
    }

    tempFilename(): string {
        return resolve(tmpdir(), `matter-${process.pid}-${Date.now()}-${this.#tempCounter++}`);
    }

    tempDirectory(): Directory {
        return new NodeJsDirectory(this, this.tempFilename(), "");
    }
}
