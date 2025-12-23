/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncCache,
    Bytes,
    createPromise,
    fromJson,
    Logger,
    MatterAggregateError,
    Seconds,
    Storage,
    StorageError,
    SupportedStorageTypes,
    toJson,
} from "#general";
import { openAsBlob } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const logger = new Logger("StorageBackendDisk");

export class StorageBackendDisk extends Storage {
    readonly #path: string;
    readonly #clear: boolean;
    protected isInitialized = false;
    #writeFileBlocker = new Map<string, Promise<void>>();
    // Cache the result of readdir for 10s, this optimized the Behavior initialization a lot
    readonly #files = new AsyncCache<string[], void>("readdir", (path: string) => readdir(path), Seconds(10));

    constructor(path: string, clear = false) {
        super();
        this.#path = path;
        this.#clear = clear;
    }

    get initialized() {
        return this.isInitialized;
    }

    async initialize() {
        if (this.#clear) {
            await this.clear();
        }
        await mkdir(this.#path, { recursive: true });
        this.isInitialized = true;
    }

    async #finishAllWrites(filename?: string) {
        // Let's try maximum up to 10 times to finish all writes out there, otherwise something is strange
        if (
            (filename !== undefined && this.#writeFileBlocker.has(filename)) ||
            (filename === undefined && this.#writeFileBlocker.size > 0)
        ) {
            for (let i = 0; i < 10; i++) {
                await MatterAggregateError.allSettled(
                    filename !== undefined ? [this.#writeFileBlocker.get(filename)] : this.#writeFileBlocker.values(),
                    "Error on finishing all file system writes to storage",
                );
                if (!this.#writeFileBlocker.size) {
                    return;
                }
            }
            await this.#fsyncStorageDir();
        }
    }

    async close() {
        this.isInitialized = false;
        await this.#finishAllWrites();
        this.#files.close();
    }

    filePath(fileName: string) {
        return join(this.#path, fileName);
    }

    async clear() {
        await this.#finishAllWrites();
        this.#files.delete(this.#path);
        await rm(this.#path, { recursive: true, force: true });
        await mkdir(this.#path, { recursive: true });
    }

    getContextBaseKey(contexts: string[], allowEmptyContext = false) {
        const contextKey = contexts.join(".");
        if (
            (!contextKey.length && !allowEmptyContext) ||
            contextKey.includes("..") ||
            contextKey.startsWith(".") ||
            contextKey.endsWith(".")
        )
            throw new StorageError("Context must not be an empty and not contain dots.");
        return contextKey;
    }

    buildStorageKey(contexts: string[], key: string) {
        if (!key.length) {
            throw new StorageError("Key must not be an empty string.");
        }
        const contextKey = this.getContextBaseKey(contexts);
        const rawName = `${contextKey}.${key}`;
        return encodeURIComponent(rawName)
            .replace(/[!'()]/g, escape)
            .replace(/\*/g, "%2A");
    }

    override async has(contexts: string[], key: string): Promise<boolean> {
        const fileName = this.filePath(this.buildStorageKey(contexts, key));
        if (this.#writeFileBlocker.has(fileName)) {
            // We are writing that key right now, so yes it exists
            return true;
        }
        try {
            const stats = await stat(fileName);
            return stats.isFile();
        } catch (error: any) {
            if (error.code === "ENOENT") return false;
            throw error;
        }
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        const fileName = this.filePath(this.buildStorageKey(contexts, key));
        await this.#finishAllWrites(fileName);

        let value: string;
        try {
            value = await readFile(fileName, "utf8");
        } catch (error: any) {
            if (error.code === "ENOENT") return undefined;
            throw error;
        }
        try {
            return fromJson(value) as T;
        } catch (error) {
            logger.error(`Failed to parse storage value for key ${key} in context ${contexts.join(".")}`);
        }
    }

    async openBlob(contexts: string[], key: string): Promise<Blob> {
        const fileName = this.filePath(this.buildStorageKey(contexts, key));
        await this.#finishAllWrites(fileName);
        if (await this.has(contexts, key)) {
            return await openAsBlob(fileName);
        } else {
            return new Blob();
        }
    }

    writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>) {
        return this.#writeFile(this.buildStorageKey(contexts, key), stream);
    }

    set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
    set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
    async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (typeof keyOrValues === "string") {
            return this.#writeFile(this.buildStorageKey(contexts, keyOrValues), toJson(value));
        }

        const promises = new Array<Promise<void>>();
        for (const [key, value] of Object.entries(keyOrValues)) {
            promises.push(this.#writeFile(this.buildStorageKey(contexts, key), toJson(value)));
        }
        await MatterAggregateError.allSettled(promises, "Error when writing values into filesystem storage");
    }

    /** According to Node.js documentation, writeFile is not atomic. This method ensures atomicity. */
    async #writeFile(fileName: string, valueOrStream: string | ReadableStream<Bytes>): Promise<void> {
        const blocker = this.#writeFileBlocker.get(fileName);
        if (blocker !== undefined) {
            await blocker;
            return this.#writeFile(fileName, valueOrStream);
        }

        const promise = this.#writeAndMoveFile(this.filePath(fileName), valueOrStream).finally(() => {
            this.#writeFileBlocker.delete(fileName);
        });
        this.#writeFileBlocker.set(fileName, promise);

        return promise;
    }

    async #writeAndMoveFile(filepath: string, valueOrStream: string | ReadableStream<Bytes>): Promise<void> {
        const tmpName = `${filepath}.tmp`;
        const handle = await open(tmpName, "w");
        const isStream = valueOrStream instanceof ReadableStream;
        const writer = handle.createWriteStream({ encoding: isStream ? null : "utf8", flush: true });

        const { resolver, rejecter, promise: writePromise } = createPromise<void>();
        writer.on("finish", resolver);
        writer.on("error", rejecter);

        let reader: ReadableStreamDefaultReader<Bytes> | undefined;
        try {
            if (isStream) {
                reader = valueOrStream.getReader();
                while (true) {
                    const { value: chunk, done } = await reader.read();
                    if (chunk) {
                        if (!writer.write(chunk)) {
                            // Backpressure: wait for the buffer to drain.
                            await new Promise<void>(resolve => writer.once("drain", resolve));
                        }
                    }
                    if (done) {
                        break;
                    }
                }
            } else {
                writer.write(valueOrStream);
            }
            writer.end();

            await writePromise;
        } finally {
            if (isStream && reader) {
                if (valueOrStream.locked) {
                    reader.releaseLock(); // release the reader lock
                }
                await valueOrStream.cancel();
            }
            await handle.close();
        }

        this.#files.delete(this.#path);
        await rename(tmpName, filepath);
    }

    /**
     * fsync on a directory ensures there are no rename operations etc. which haven't been persisted to disk.
     * We do this as best effort to ensure that all writes are persisted to disk.
     */
    async #fsyncStorageDir() {
        if (process.platform === "win32") {
            // Windows will cause `EPERM: operation not permitted, fsync`
            // for directories, so lets catch this generically
            return;
        }
        const fd = await open(this.#path, "r");
        try {
            await fd.sync();
        } catch (error) {
            logger.warn(`Failed to fsync storage directory ${this.#path}`, error);
        } finally {
            await fd.close();
        }
    }

    async delete(contexts: string[], key: string) {
        const filename = this.buildStorageKey(contexts, key);
        await this.#finishAllWrites(filename);

        await rm(this.filePath(filename), { force: true });
        this.#files.delete(this.#path);
    }

    /** Returns all keys of a storage context without keys of sub-contexts */
    async keys(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts);
        const keys = [];
        const contextKeyStart = `${contextKey}.`;
        const len = contextKeyStart.length;

        const files = await this.#files.get(this.#path);

        for (const key of files) {
            const decodedKey = decodeURIComponent(key);
            if (decodedKey.startsWith(contextKeyStart) && !decodedKey.includes(".", len)) {
                keys.push(decodedKey.substring(len));
            }
        }
        return keys;
    }

    async values(contexts: string[]) {
        // Initialize and context checks are done by keys method
        const values = {} as Record<string, SupportedStorageTypes>;

        const promises = new Array<Promise<void>>();
        for (const key of await this.keys(contexts)) {
            promises.push(
                (async () => {
                    const value = await this.get(contexts, key);
                    if (value !== undefined) {
                        values[key] = value;
                    }
                })(),
            );
        }
        await MatterAggregateError.allSettled(promises, "Error when reading values from filesystem storage");
        return values;
    }

    async contexts(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts, true);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        const len = startContextKey.length;
        const foundContexts = new Array<string>();

        const files = await this.#files.get(this.#path);

        for (const key of files) {
            const decodedKey = decodeURIComponent(key);
            if (decodedKey.startsWith(startContextKey)) {
                const subKeys = decodedKey.substring(len).split(".");
                if (subKeys.length === 1) continue; // found leaf key
                const context = subKeys[0];
                if (!foundContexts.includes(context)) {
                    foundContexts.push(context);
                }
            }
        }
        return foundContexts;
    }

    async clearAll(contexts: string[]) {
        await this.#finishAllWrites();
        const contextKey = this.getContextBaseKey(contexts, true);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";

        const files = await readdir(this.#path);

        const promises = new Array<Promise<void>>();
        for (const key of files) {
            const decodedKey = decodeURIComponent(key);
            if (decodedKey.startsWith(startContextKey)) {
                promises.push(rm(this.filePath(key), { force: true }));
            }
        }

        // Clear cache before and after to make sure we do not have any in-between state cached because we delete multiple files
        this.#files.delete(this.#path);
        await MatterAggregateError.allSettled(promises, "Error when clearing all values from filesystem storage");
        this.#files.delete(this.#path);
    }
}
