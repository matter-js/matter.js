/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Directory,
    FileNotFoundError,
    FileTypeError,
    type Bytes,
    type Filesystem,
    type FilesystemNode,
    type MaybeAsyncIterable,
} from "@matter/general";
import { createWriteStream, type WriteStream } from "node:fs";
import { cp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { finished } from "node:stream/promises";

export async function nodeExists(path: string): Promise<boolean> {
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

export async function nodeStat(path: string): Promise<FilesystemNode.Stat> {
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

export async function* nodeEntries(
    fs: Filesystem,
    dirPath: string,
    FileClass: new (fs: Filesystem, path: string, name: string, cachedStat?: FilesystemNode.Stat) => Directory.Entry,
    DirClass: new (fs: Filesystem, path: string, name: string, cachedStat?: FilesystemNode.Stat) => Directory,
): AsyncGenerator<Directory.Entry> {
    const dirents = await readdir(dirPath, { withFileTypes: true });
    for (const dirent of dirents) {
        const fullPath = resolve(dirPath, dirent.name);
        const s = await stat(fullPath);
        const cached: FilesystemNode.Stat = {
            size: s.size,
            mtime: s.mtime,
            type: dirent.isDirectory() ? "directory" : "file",
        };
        if (dirent.isDirectory()) {
            yield new DirClass(fs, fullPath, dirent.name, cached);
        } else {
            yield new FileClass(fs, fullPath, dirent.name, cached);
        }
    }
}

export function resolveCopyArg(basePath: string, arg: string | FilesystemNode): string {
    if (typeof arg === "string") {
        return resolve(basePath, arg);
    }
    if ("path" in arg && typeof arg.path === "string") {
        return arg.path;
    }
    throw new FileTypeError("Cannot resolve path for copy argument");
}

export async function nodeCopy(basePath: string, source: string | FilesystemNode, target: string | FilesystemNode) {
    const srcPath = resolveCopyArg(basePath, source);
    const dstPath = resolveCopyArg(basePath, target);
    await cp(srcPath, dstPath, { recursive: true });
}

export async function nodeDelete(path: string) {
    await rm(path, { recursive: true, force: true });
}

export function isBytes(value: unknown): value is Bytes {
    return ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof SharedArrayBuffer;
}

export function toBytes(value: Bytes): Uint8Array {
    return value instanceof Uint8Array ? value : new Uint8Array(ArrayBuffer.isView(value) ? value.buffer : value);
}

async function streamWrite(ws: WriteStream, chunk: string | Uint8Array): Promise<void> {
    if (!ws.write(chunk)) {
        await new Promise<void>(resolve => ws.once("drain", resolve));
    }
}

export async function writeData(
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
