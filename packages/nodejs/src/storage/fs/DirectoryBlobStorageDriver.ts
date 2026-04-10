/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BaseStorageDriver,
    BlobStorageDriver,
    Bytes,
    type DataNamespace,
    type Directory,
    FilesystemLocking,
    StorageError,
} from "@matter/general";

/**
 * Filesystem-backed blob storage driver using nested directories.
 *
 * Contexts map to nested directories; keys map to files within those directories.
 * Context segments are percent-encoded to avoid path separator conflicts.
 */
export class DirectoryBlobStorageDriver extends FilesystemLocking(BlobStorageDriver) {
    static readonly id: string = "dir";

    static create(namespace: DataNamespace, _descriptor: BlobStorageDriver.Descriptor): DirectoryBlobStorageDriver {
        return new DirectoryBlobStorageDriver(namespace);
    }

    readonly #rootDir: Directory;
    #initialized = false;

    constructor(namespace: DataNamespace) {
        super();
        this.initFilesystem(namespace);
        this.#rootDir = this.root!.directory;
    }

    get initialized() {
        return this.#initialized;
    }

    async initialize() {
        await this.acquireLock();
        await this.#rootDir.mkdir();
        this.#initialized = true;
    }

    async close() {
        this.#initialized = false;
        await this.releaseLock();
    }

    async openBlob(contexts: string[], key: string): Promise<Blob> {
        const file = this.#resolve(contexts, key);
        if (!(await file.exists())) {
            return new Blob([]);
        }
        const bytes = await file.readAllBytes();
        return new Blob([Bytes.exclusive(bytes)]);
    }

    // TODO: writes go directly to the final file via the File abstraction's streaming support.
    // Not atomic — a crash mid-write leaves a partial file.  Hardening with write-to-tmp + rename
    // would require bypassing File.write() to get a temp path in the same directory.
    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        validateKey(key);

        // Ensure all parent directories exist
        let dir = this.#rootDir;
        for (const ctx of contexts) {
            if (ctx === ".." || ctx === "." || !ctx.length || ctx.includes("\\")) {
                throw new StorageError(`Context segment "${ctx}" is not allowed`);
            }
            dir = dir.directory(encodeContextSegment(ctx));
            await dir.mkdir();
        }

        // Stream chunks to disk — no full-blob RAM buffering
        const file = dir.file(key);
        await file.write(streamToAsyncIterable(stream));
    }

    async delete(contexts: string[], key: string): Promise<void> {
        const file = this.#resolve(contexts, key);
        if (await file.exists()) {
            await file.delete();
        }
    }

    async has(contexts: string[], key: string): Promise<boolean> {
        return this.#resolve(contexts, key).exists();
    }

    async keys(contexts: string[]): Promise<string[]> {
        const dir = this.#contextDir(contexts);
        if (!(await dir.exists())) {
            return [];
        }
        const files = await dir.files();
        return files.filter(f => !BaseStorageDriver.RESERVED_FILENAMES.has(f) && !f.endsWith(".tmp"));
    }

    async contexts(contexts: string[]): Promise<string[]> {
        const dir = this.#contextDir(contexts);
        if (!(await dir.exists())) {
            return [];
        }
        const encoded = await dir.directories();
        return encoded.map(decodeContextSegment);
    }

    async clearAll(contexts: string[]): Promise<void> {
        const dir = this.#contextDir(contexts);
        if (await dir.exists()) {
            await dir.delete();
        }
    }

    #contextDir(contexts: string[]): Directory {
        let dir: Directory = this.#rootDir;
        for (const ctx of contexts) {
            if (ctx === ".." || ctx === "." || !ctx.length || ctx.includes("\\")) {
                throw new StorageError(`Context segment "${ctx}" is not allowed`);
            }
            dir = dir.directory(encodeContextSegment(ctx));
        }
        return dir;
    }

    #resolve(contexts: string[], key: string) {
        validateKey(key);
        return this.#contextDir(contexts).file(key);
    }
}

/** Reject keys that could escape the storage directory, collide with metadata, or become invisible. */
function validateKey(key: string) {
    if (!key.length) {
        throw new StorageError("Key must not be empty");
    }
    if (key.includes("/") || key.includes("\\") || key === ".." || key.startsWith("../") || key.includes("/../")) {
        throw new StorageError(`Key "${key}" contains path traversal characters`);
    }
    if (BaseStorageDriver.RESERVED_FILENAMES.has(key)) {
        throw new StorageError(`Key "${key}" is a reserved filename`);
    }
    if (key.endsWith(".tmp")) {
        throw new StorageError(`Key "${key}" must not end with ".tmp" (reserved for atomic writes)`);
    }
}

/** Convert a ReadableStream to an AsyncIterable for streaming writes. */
async function* streamToAsyncIterable(stream: ReadableStream<Bytes>): AsyncIterable<Uint8Array> {
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            yield Bytes.of(value);
        }
    } finally {
        reader.releaseLock();
    }
}

/** Percent-encode `/` and `%` in a single context segment so it is path-safe. */
function encodeContextSegment(segment: string): string {
    return segment.replace(/%/g, "%25").replace(/\//g, "%2F");
}

/** Reverse the percent-encoding applied by {@link encodeContextSegment}. */
function decodeContextSegment(encoded: string): string {
    return encoded.replace(/%2F/gi, "/").replace(/%25/g, "%");
}
