/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Directory,
    File,
    FileNotFoundError,
    FileTypeError,
    Filesystem,
    type Bytes,
    type FilesystemNode,
    type MaybeAsyncIterable,
    type MaybePromise,
} from "#general";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { open as fsOpen, rename as fsRename, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { finished } from "node:stream/promises";

/**
 * Filesystem backed by the local OS filesystem via Node.js APIs.
 */
export class NodeJsFilesystem extends Filesystem {
    readonly #rootPath: string;

    constructor(workingDirectory: string) {
        super();
        this.#rootPath = workingDirectory;
    }

    get name() {
        return "";
    }

    override get path() {
        return this.#rootPath;
    }

    async exists(): Promise<boolean> {
        return nodeExists(this.#rootPath);
    }

    stat(): Promise<FilesystemNode.Stat> {
        return nodeStat(this.#rootPath);
    }

    rename(): Promise<void> {
        throw new FileTypeError("Cannot rename root");
    }

    async delete(): Promise<void> {
        await rm(this.#rootPath, { recursive: true, force: true });
    }

    async *entries(): AsyncIterable<Directory.Entry> {
        yield* nodeEntries(this.#rootPath);
    }

    file(name: string): File {
        return new NodeJsFile(join(this.#rootPath, name), name);
    }

    directory(name: string): Directory {
        return new NodeJsDirectory(join(this.#rootPath, name), name);
    }

    async mkdir(): Promise<void> {
        await mkdir(this.#rootPath, { recursive: true });
    }
}

async function nodeExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        throw e;
    }
}

async function nodeStat(path: string): Promise<FilesystemNode.Stat> {
    let s;
    try {
        s = await stat(path);
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
            throw new FileNotFoundError(`Not found: ${path}`);
        }
        throw e;
    }
    return {
        size: s.size,
        mtime: s.mtime,
        type: s.isDirectory() ? "directory" : "file",
    };
}

async function* nodeEntries(dirPath: string): AsyncGenerator<Directory.Entry> {
    const dirents = await readdir(dirPath, { withFileTypes: true });
    for (const dirent of dirents) {
        const fullPath = join(dirPath, dirent.name);
        const s = await stat(fullPath);
        const cached: FilesystemNode.Stat = {
            size: s.size,
            mtime: s.mtime,
            type: dirent.isDirectory() ? "directory" : "file",
        };
        if (dirent.isDirectory()) {
            yield new NodeJsDirectory(fullPath, dirent.name, cached);
        } else {
            yield new NodeJsFile(fullPath, dirent.name, cached);
        }
    }
}

function isBytes(value: unknown): value is Bytes {
    return ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof SharedArrayBuffer;
}

function toBytes(value: Bytes): Uint8Array {
    return value instanceof Uint8Array ? value : new Uint8Array(ArrayBuffer.isView(value) ? value.buffer : value);
}

async function streamWrite(ws: WriteStream, chunk: string | Uint8Array): Promise<void> {
    if (!ws.write(chunk)) {
        await new Promise<void>(resolve => ws.once("drain", resolve));
    }
}

async function writeData(
    path: string,
    data: Bytes | string | MaybeAsyncIterable<Bytes> | MaybeAsyncIterable<string>,
): Promise<void> {
    if (typeof data === "string") {
        await writeFile(path, data, "utf8");
        return;
    }
    if (isBytes(data)) {
        await writeFile(path, toBytes(data));
        return;
    }

    const iter = Symbol.asyncIterator in data ? data[Symbol.asyncIterator]() : data[Symbol.iterator]();
    const first = await iter.next();

    if (first.done) {
        await writeFile(path, new Uint8Array(0));
        return;
    }

    const isText = typeof first.value === "string";
    const ws = createWriteStream(path, isText ? { encoding: "utf8" } : undefined);
    try {
        if (isText) {
            await streamWrite(ws, first.value as string);
            while (true) {
                const next = await iter.next();
                if (next.done) break;
                await streamWrite(ws, "\n" + (next.value as string));
            }
        } else {
            await streamWrite(ws, toBytes(first.value as Bytes));
            while (true) {
                const next = await iter.next();
                if (next.done) break;
                await streamWrite(ws, toBytes(next.value as Bytes));
            }
        }
        ws.end();
        await finished(ws);
    } catch (e) {
        ws.destroy();
        throw e;
    }
}

class NodeJsFile extends File {
    #path: string;
    #name: string;
    readonly #cachedStat?: FilesystemNode.Stat;

    constructor(path: string, name: string, cachedStat?: FilesystemNode.Stat) {
        super();
        this.#path = path;
        this.#name = name;
        this.#cachedStat = cachedStat;
    }

    get name() {
        return this.#name;
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

    async open(mode?: File.OpenMode): Promise<File.Handle> {
        const m = mode ?? "r";
        const flags = m === "w" ? "w" : m === "a" ? "a" : "r";
        if (flags === "w" || flags === "a") {
            await mkdir(dirname(this.#path), { recursive: true });
        }
        const fh = await fsOpen(this.#path, flags);
        return new NodeJsFileHandle(this.#path, this.#name, fh);
    }

    async rename(newName: string): Promise<void> {
        const newPath = join(dirname(this.#path), newName);
        await fsRename(this.#path, newPath);
        this.#path = newPath;
        this.#name = newName;
    }

    async delete(): Promise<void> {
        await rm(this.#path, { recursive: true, force: true });
    }
}

class NodeJsDirectory extends Directory {
    #path: string;
    #name: string;
    readonly #cachedStat?: FilesystemNode.Stat;

    constructor(path: string, name: string, cachedStat?: FilesystemNode.Stat) {
        super();
        this.#path = path;
        this.#name = name;
        this.#cachedStat = cachedStat;
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
        const newPath = join(dirname(this.#path), newName);
        await fsRename(this.#path, newPath);
        this.#path = newPath;
        this.#name = newName;
    }

    async delete(): Promise<void> {
        await rm(this.#path, { recursive: true, force: true });
    }

    async *entries(): AsyncIterable<Directory.Entry> {
        yield* nodeEntries(this.#path);
    }

    file(name: string): File {
        return new NodeJsFile(join(this.#path, name), name);
    }

    directory(name: string): Directory {
        return new NodeJsDirectory(join(this.#path, name), name);
    }

    async mkdir(): Promise<void> {
        await mkdir(this.#path, { recursive: true });
    }
}

class NodeJsFileHandle extends File.Handle {
    #path: string;
    #name: string;
    readonly #fh: import("node:fs/promises").FileHandle;

    constructor(path: string, name: string, fh: import("node:fs/promises").FileHandle) {
        super();
        this.#path = path;
        this.#name = name;
        this.#fh = fh;
    }

    get name() {
        return this.#name;
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

    async open(): Promise<File.Handle> {
        return this;
    }

    async writeHandle(data: Bytes | string): Promise<void> {
        if (typeof data === "string") {
            await this.#fh.write(data, undefined, "utf8");
        } else {
            await this.#fh.write(toBytes(data));
        }
    }

    async fsync(): Promise<void> {
        await this.#fh.datasync();
    }

    async close(): Promise<void> {
        await this.#fh.close();
    }

    async rename(newName: string): Promise<void> {
        const newPath = join(dirname(this.#path), newName);
        await fsRename(this.#path, newPath);
        this.#path = newPath;
        this.#name = newName;
    }

    async delete(): Promise<void> {
        await rm(this.#path, { recursive: true, force: true });
    }
}
