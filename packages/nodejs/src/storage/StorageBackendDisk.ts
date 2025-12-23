/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    createPromise,
    fromJson,
    Logger,
    MatterAggregateError,
    Storage,
    StorageError,
    SupportedStorageTypes,
    toJson,
} from "#general";
import { openAsBlob } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const logger = new Logger("StorageBackendDisk");

/**
 * For legacy reasons we store in an inefficient "one-value-per-file-all-in-one-directory" format.  To make this at
 * least marginally performant we assume we are the only writer to this directory and maintain an internal index of
 * nodes in the storage tree using this structure.
 *
 * TODO - replace all this
 */
interface ContextIndex {
    contexts?: Map<string, ContextIndex>;
    keys?: Set<string>;
}

export class StorageBackendDisk extends Storage {
    readonly #path: string;
    readonly #clear: boolean;
    protected isInitialized = false;
    #writeFileBlocker = new Map<string, Promise<void>>();
    #index: ContextIndex = {};

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

        const files = await readdir(this.#path);
        for (const file of files) {
            const parts = decodeURIComponent(file).split(".");
            this.#markValue(parts.slice(0, -1), parts[parts.length - 1]);
        }

        this.isInitialized = true;
    }

    #indexFor(contexts: string[]) {
        let node = this.#index;
        for (const name of contexts) {
            let child = node.contexts?.get(name);
            if (child === undefined) {
                child = {};
                if (!node.contexts) {
                    node.contexts = new Map();
                }
                node.contexts.set(name, child);
            }
            node = child;
        }
        return node;
    }

    #markValue(contexts: string[], key: string) {
        const index = this.#indexFor(contexts);
        if (!index.keys) {
            index.keys = new Set();
        }
        index.keys.add(key);
    }

    async #finishAllWrites(filename?: string) {
        // Let's try max up to 10 times to finish all writes out there, otherwise something is strange
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
    }

    filePath(fileName: string) {
        return join(this.#path, fileName);
    }

    async clear() {
        await this.#finishAllWrites();
        this.#index = {};
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
        const index = this.#indexFor(contexts);
        return !!index.keys?.has(key);
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
        return this.#writeFile(contexts, key, stream);
    }

    set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
    set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
    async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (typeof keyOrValues === "string") {
            return this.#writeFile(contexts, keyOrValues, toJson(value));
        }

        const promises = new Array<Promise<void>>();
        for (const [key, value] of Object.entries(keyOrValues)) {
            promises.push(this.#writeFile(contexts, key, toJson(value)));
        }
        await MatterAggregateError.allSettled(promises, "Error when writing values into filesystem storage");
    }

    /** According to Node.js documentation, writeFile is not atomic. This method ensures atomicity. */
    async #writeFile(contexts: string[], key: string, valueOrStream: string | ReadableStream<Bytes>): Promise<void> {
        const fileName = this.buildStorageKey(contexts, key);
        const blocker = this.#writeFileBlocker.get(fileName);
        if (blocker !== undefined) {
            await blocker;
            return this.#writeFile(contexts, key, valueOrStream);
        }

        const promise = this.#writeAndMoveFile(this.filePath(fileName), valueOrStream).finally(() => {
            this.#writeFileBlocker.delete(fileName);
            this.#markValue(contexts, key);
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
        await this.#rm(this.buildStorageKey(contexts, key), this.#indexFor(contexts), key);
    }

    async #rm(filename: string, index: ContextIndex, key: string) {
        await this.#finishAllWrites(filename);
        return rm(this.filePath(filename), { force: true }).finally(() => {
            index.keys?.delete(key);
        });
    }

    /** Returns all keys of a storage context without keys of sub-contexts */
    async keys(contexts: string[]) {
        const index = this.#indexFor(contexts);
        return index.keys ? [...index.keys] : [];
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

    contexts(contexts: string[]): string[] {
        const index = this.#indexFor(contexts);
        return index.contexts ? [...index.contexts.keys()] : [];
    }

    async clearAll(contexts: string[]) {
        await this.#finishAllWrites();
        const parent = this.#indexFor(contexts.slice(0, -1));
        const name = contexts[contexts.length - 1];
        await this.#clearChildContext(contexts, parent, name);
    }

    async #clearChildContext(contexts: string[], parent: ContextIndex, name: string) {
        const index = parent.contexts?.get(name);
        if (index === undefined) {
            return;
        }

        if (index.contexts) {
            for (const name of index.contexts.keys()) {
                await this.#clearChildContext([...contexts, name], index, name);
            }
        }

        if (index.keys) {
            for (const key of index.keys) {
                await this.#rm(this.buildStorageKey(contexts, key), index, key);
            }
        }
    }
}
