/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    File,
    FileHandleTracker,
    FileTypeError,
    type Bytes,
    type Filesystem,
    type FilesystemNode,
    type MaybeAsyncIterable,
    type MaybePromise,
} from "@matter/general";
import { createReadStream } from "node:fs";
import { open as fsOpen, rename as fsRename, mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { nodeExists, nodeStat, toBytes, writeData } from "./fs-utils.js";

export class NodeJsFile extends File {
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

    get path() {
        return this.#path;
    }

    async exists(): Promise<boolean> {
        return nodeExists(this.#path);
    }

    stat(): MaybePromise<FilesystemNode.Stat> {
        if (this.#cachedStat) {
            return this.#cachedStat;
        }
        return nodeStat(this.#path);
    }

    async *readBytes(): AsyncIterable<Uint8Array> {
        const s = await nodeStat(this.#path);
        if (s.type === "directory") {
            throw new FileTypeError("Cannot read bytes from a directory");
        }
        const stream = createReadStream(this.#path);
        try {
            for await (const chunk of stream) {
                yield chunk;
            }
        } finally {
            stream.destroy();
        }
    }

    async *readText(options?: File.ReadTextOptions): AsyncIterable<string> {
        const s = await nodeStat(this.#path);
        if (s.type === "directory") {
            throw new FileTypeError("Cannot read text from a directory");
        }
        if (options?.lines) {
            const stream = createReadStream(this.#path, { encoding: "utf8" });
            try {
                let carry = "";
                for await (const chunk of stream) {
                    const parts = (carry + chunk).split("\n");
                    carry = parts.pop()!;
                    yield* parts;
                }
                yield carry;
            } finally {
                stream.destroy();
            }
        } else {
            const stream = createReadStream(this.#path, { encoding: "utf8" });
            try {
                for await (const chunk of stream) {
                    yield chunk;
                }
            } finally {
                stream.destroy();
            }
        }
    }

    async write(data: Bytes | string | MaybeAsyncIterable<Bytes> | MaybeAsyncIterable<string>): Promise<void> {
        await writeData(this.#path, data);
    }

    async open(purpose: string, mode?: File.OpenMode): Promise<File.Handle> {
        const m = mode ?? "r";
        const flags = m === "w" ? "w" : m === "a" ? "a" : "r";
        if (flags === "w" || flags === "a") {
            await mkdir(dirname(this.#path), { recursive: true });
        }
        const fh = await fsOpen(this.#path, flags);
        return new NodeJsFileHandle({ fs: this.#fs, path: this.#path, name: this.#name, purpose, fh });
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
}

class NodeJsFileHandle extends File.Handle {
    readonly #fs: Filesystem;
    #path: string;
    #name: string;
    readonly purpose: string;
    readonly #fh: import("node:fs/promises").FileHandle;

    constructor(options: NodeJsFileHandle.Options) {
        super();
        this.#fs = options.fs;
        this.#path = options.path;
        this.#name = options.name;
        this.purpose = options.purpose;
        this.#fh = options.fh;
        FileHandleTracker.register(this);
    }

    override get fs() {
        return this.#fs;
    }

    get name() {
        return this.#name;
    }

    get path() {
        return this.#path;
    }

    async exists(): Promise<boolean> {
        return nodeExists(this.#path);
    }

    stat(): MaybePromise<FilesystemNode.Stat> {
        return nodeStat(this.#path);
    }

    async *readBytes(): AsyncIterable<Uint8Array> {
        const stream = createReadStream(this.#path);
        try {
            for await (const chunk of stream) {
                yield chunk;
            }
        } finally {
            stream.destroy();
        }
    }

    async *readText(options?: File.ReadTextOptions): AsyncIterable<string> {
        if (options?.lines) {
            const stream = createReadStream(this.#path, { encoding: "utf8" });
            try {
                let carry = "";
                for await (const chunk of stream) {
                    const parts = (carry + chunk).split("\n");
                    carry = parts.pop()!;
                    yield* parts;
                }
                yield carry;
            } finally {
                stream.destroy();
            }
        } else {
            const stream = createReadStream(this.#path, { encoding: "utf8" });
            try {
                for await (const chunk of stream) {
                    yield chunk;
                }
            } finally {
                stream.destroy();
            }
        }
    }

    async write(data: Bytes | string | MaybeAsyncIterable<Bytes> | MaybeAsyncIterable<string>): Promise<void> {
        await writeData(this.#path, data);
    }

    async open(_purpose: string): Promise<File.Handle> {
        return this;
    }

    async writeHandle(data: Bytes | string): Promise<void> {
        if (typeof data === "string") {
            await this.#fh.write(data, undefined, "utf8");
        } else {
            await this.#fh.write(toBytes(data));
        }
    }

    cursor(max: number, bufferSize?: number): File.Cursor {
        return new NodeJsCursor(this.#fh, max, bufferSize);
    }

    async truncate(size?: number): Promise<void> {
        await this.#fh.truncate(size ?? 0);
    }

    async fsync(): Promise<void> {
        await this.#fh.datasync();
    }

    async close(): Promise<void> {
        FileHandleTracker.unregister(this);
        await this.#fh.close();
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
}

namespace NodeJsFileHandle {
    export interface Options {
        fs: Filesystem;
        path: string;
        name: string;
        purpose: string;
        fh: import("node:fs/promises").FileHandle;
    }
}

class NodeJsCursor extends File.Cursor {
    readonly #fh: import("node:fs/promises").FileHandle;
    readonly #shared: Buffer;

    constructor(fh: import("node:fs/promises").FileHandle, max: number, bufferSize?: number) {
        super(max);
        this.#fh = fh;
        this.#shared = Buffer.alloc(bufferSize ?? 8192);
    }

    protected override async readAt(position: number, length: number, copy?: boolean): Promise<Uint8Array> {
        if (copy || length > this.#shared.length) {
            const buf = Buffer.alloc(length);
            const { bytesRead } = await this.#fh.read(buf, 0, length, position);
            return bytesRead < length ? buf.subarray(0, bytesRead) : buf;
        }

        const { bytesRead } = await this.#fh.read(this.#shared, 0, length, position);
        return this.#shared.subarray(0, bytesRead);
    }
}
