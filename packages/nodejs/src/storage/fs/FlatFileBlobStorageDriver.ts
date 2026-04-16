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
    FilesystemBlobStorageDriver,
    StorageError,
} from "@matter/general";
import { createWriteStream, existsSync, openAsBlob } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Blob storage driver using the legacy flat-file format from {@link FileStorageDriver}.
 *
 * All blobs live in a single directory.  The filename is the URI-encoded concatenation of context
 * segments and key joined by `.`.  Example: contexts `["bin", "fff1", "8000"]` with key `"prod"`
 * becomes the file `bin.fff1.8000.prod` (percent-encoded).
 */
export class FlatFileBlobStorageDriver extends FilesystemBlobStorageDriver {
    static readonly id = "file";

    static create(namespace: DataNamespace, _descriptor: BlobStorageDriver.Descriptor): FlatFileBlobStorageDriver {
        return new FlatFileBlobStorageDriver(namespace);
    }

    readonly #path: string;
    #initialized = false;

    constructor(namespace: DataNamespace) {
        super(namespace);
        this.#path = this.root!.directory.path;
    }

    get initialized() {
        return this.#initialized;
    }

    override async initialize() {
        await super.initialize();
        await mkdir(this.#path, { recursive: true });
        this.#initialized = true;
    }

    override async close() {
        this.#initialized = false;
        await super.close();
    }

    async openBlob(contexts: string[], key: string): Promise<Blob> {
        const filePath = join(this.#path, buildStorageKey(contexts, key));
        if (!existsSync(filePath)) {
            return new Blob([]);
        }
        return await openAsBlob(filePath);
    }

    // Stream chunks to disk via atomic write-to-tmp + rename
    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        const fileName = buildStorageKey(contexts, key);
        const filePath = join(this.#path, fileName);
        const tmpPath = `${filePath}.tmp`;
        const reader = stream.getReader();
        const writer = createWriteStream(tmpPath);

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = Bytes.of(value);
                if (!writer.write(chunk)) {
                    await new Promise<void>(resolve => writer.once("drain", resolve));
                }
            }
            writer.end();
            await new Promise<void>((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
            });
            // Atomic rename
            await rename(tmpPath, filePath);
        } catch (error) {
            writer.destroy();
            await rm(tmpPath, { force: true });
            throw error;
        } finally {
            reader.releaseLock();
        }
    }

    async delete(contexts: string[], key: string): Promise<void> {
        const filePath = join(this.#path, buildStorageKey(contexts, key));
        await rm(filePath, { force: true });
    }

    async has(contexts: string[], key: string): Promise<boolean> {
        const filePath = join(this.#path, buildStorageKey(contexts, key));
        return existsSync(filePath);
    }

    // When contexts is empty, prefixDot is "" and startsWith("") is always true — every file
    // matches.  The caller (keys/contexts/clearAll) then applies its own filtering on the remainder.
    async keys(contexts: string[]): Promise<string[]> {
        const prefixDot = contextPrefixDot(contexts);
        const result = new Array<string>();

        for (const { remainder } of await this.#listDecodedFiles(prefixDot)) {
            // No dot in remainder → this is a direct key at this context level
            if (remainder.length && !remainder.includes(".")) {
                result.push(remainder);
            }
        }

        return result;
    }

    async contexts(contexts: string[]): Promise<string[]> {
        const prefixDot = contextPrefixDot(contexts);
        const found = new Set<string>();

        for (const { remainder } of await this.#listDecodedFiles(prefixDot)) {
            const dotIndex = remainder.indexOf(".");
            if (dotIndex > 0) {
                found.add(remainder.substring(0, dotIndex));
            }
        }

        return [...found];
    }

    async clearAll(contexts: string[]): Promise<void> {
        const prefix = getContextBaseKey(contexts);
        const prefixDot = prefix.length ? `${prefix}.` : "";

        for (const { file, decoded } of await this.#listDecodedFiles("")) {
            if (decoded === prefix || decoded.startsWith(prefixDot)) {
                await rm(join(this.#path, file), { force: true });
            }
        }
    }

    /**
     * List all data files in the directory, decoded and filtered (excludes reserved files and
     * `.tmp` atomicity artifacts).  Returns raw filename + decoded name + remainder after prefix.
     */
    async #listDecodedFiles(prefixDot: string): Promise<Array<{ file: string; decoded: string; remainder: string }>> {
        let files: string[];
        try {
            files = await readdir(this.#path);
        } catch (e: unknown) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
            }
            throw e;
        }

        const result = new Array<{ file: string; decoded: string; remainder: string }>();
        for (const file of files) {
            if (BaseStorageDriver.RESERVED_FILENAMES.has(file) || file.endsWith(".tmp")) {
                continue;
            }
            let decoded: string;
            try {
                decoded = decodeURIComponent(file);
            } catch {
                // Skip files with malformed percent-encoding (manual edits, partial writes, etc.)
                continue;
            }
            if (!decoded.startsWith(prefixDot)) {
                continue;
            }
            result.push({ file, decoded, remainder: decoded.substring(prefixDot.length) });
        }
        return result;
    }
}

/**
 * Build the context base key by joining context segments with `.`.
 * Validates that segments don't contain dots or empty strings.
 */
function getContextBaseKey(contexts: string[]): string {
    for (const ctx of contexts) {
        if (!ctx.length || ctx.includes(".")) {
            throw new StorageError("Context must not contain empty segments or leading or trailing dots.");
        }
    }
    return contexts.join(".");
}

function contextPrefixDot(contexts: string[]): string {
    const prefix = getContextBaseKey(contexts);
    return prefix.length ? `${prefix}.` : "";
}

/**
 * Build the flat storage filename using the same encoding as {@link FileStorageDriver.buildStorageKey}.
 *
 * The raw name is `ctx1.ctx2.key`, URI-encoded with special handling for `!'()*`.
 */
function buildStorageKey(contexts: string[], key: string): string {
    if (!key.length) {
        throw new StorageError("Key must not be an empty string.");
    }
    if (key.includes(".")) {
        throw new StorageError(`Key "${key}" must not contain "." (would be misinterpreted as context separator)`);
    }
    if (key.endsWith(".tmp")) {
        throw new StorageError(`Key "${key}" must not end with ".tmp" (reserved for atomic writes)`);
    }
    if (BaseStorageDriver.RESERVED_FILENAMES.has(key)) {
        throw new StorageError(`Key "${key}" is a reserved filename`);
    }
    const contextKey = getContextBaseKey(contexts);
    const rawName = contextKey.length ? `${contextKey}.${key}` : key;
    return encodeURIComponent(rawName)
        .replace(/[!'()]/g, escape)
        .replace(/\*/g, "%2A");
}
