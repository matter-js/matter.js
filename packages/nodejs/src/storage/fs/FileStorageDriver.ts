/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    createPromise,
    FilesystemStorageDriver,
    fromJson,
    Logger,
    MatterAggregateError,
    StorageDriver,
    StorageError,
    SupportedStorageTypes,
    toJson,
    type DataNamespace,
    type LegacyBlobSource,
} from "@matter/general";
import { openAsBlob } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const logger = new Logger("FileStorageDriver");

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

export class FileStorageDriver extends FilesystemStorageDriver implements LegacyBlobSource {
    static readonly id = "file";

    static async create(namespace: DataNamespace, _descriptor: StorageDriver.Descriptor) {
        const storage = new FileStorageDriver(namespace);
        try {
            await storage.initialize();
        } catch (error) {
            await storage.close().catch(() => {});
            throw error;
        }
        return storage;
    }

    readonly #path: string;
    readonly #clear: boolean;
    protected isInitialized = false;
    #writeFileBlocker = new Map<string, Promise<void>>();
    #index: ContextIndex = {};

    constructor(namespaceOrPath?: DataNamespace | string, clear = false) {
        super(typeof namespaceOrPath === "string" || namespaceOrPath === undefined ? undefined : namespaceOrPath);
        this.#path =
            typeof namespaceOrPath === "string"
                ? namespaceOrPath
                : namespaceOrPath !== undefined
                  ? this.root!.directory.path
                  : "";
        this.#clear = clear;
    }

    get initialized() {
        return this.isInitialized;
    }

    override async initialize() {
        if (this.isInitialized) {
            throw new StorageError("Storage already initialized!");
        }
        await super.initialize();

        if (this.#clear) {
            this.#index = {};
            await rm(this.#path, { recursive: true, force: true });
        }
        await mkdir(this.#path, { recursive: true });

        const files = await readdir(this.#path);
        for (const file of files) {
            if (StorageDriver.RESERVED_FILENAMES.has(file)) {
                continue;
            }
            if (file.endsWith(".tmp")) {
                logger.info("Deleting orphaned temp file", file);
                await rm(join(this.#path, file), { force: true });
                continue;
            }
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

    override async close() {
        this.isInitialized = false;
        await this.#finishAllWrites();
        await super.close();
    }

    filePath(fileName: string) {
        return join(this.#path, fileName);
    }

    getContextBaseKey(contexts: string[]) {
        for (const ctx of contexts) {
            if (!ctx.length || ctx.includes(".")) {
                throw new StorageError("Context must not contain empty segments or leading or trailing dots.");
            }
        }
        return contexts.join(".");
    }

    buildStorageKey(contexts: string[], key: string) {
        if (!key.length) {
            throw new StorageError("Key must not be an empty string.");
        }
        if (key === "tmp") {
            throw new StorageError(`Key "tmp" is reserved for atomic write operations.`);
        }
        const contextKey = this.getContextBaseKey(contexts);
        const rawName = contextKey.length ? `${contextKey}.${key}` : key;
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

    /**
     * Read a blob from the flat file format.  Retained for legacy migration support — the
     * {@link StorageMigration} cross-type kv→blob strategy duck-types this method to extract
     * blobs from old FileStorageDriver data.
     *
     * @deprecated Only used for migration from legacy flat-file blob format.
     */
    async openBlob(contexts: string[], key: string): Promise<Blob> {
        const fileName = this.filePath(this.buildStorageKey(contexts, key));
        if (await this.has(contexts, key)) {
            return await openAsBlob(fileName);
        }
        return new Blob();
    }

    /**
     * Write blob data in the flat file format.  Retained for legacy migration support.
     *
     * @deprecated Only used for migration from legacy flat-file blob format.
     */
    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
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
        if (StorageDriver.RESERVED_FILENAMES.has(fileName)) {
            throw new StorageError(
                `Key "${key}" in context "${contexts.join(".")}" maps to reserved file "${fileName}"`,
            );
        }
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
                    reader.releaseLock();
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
            await MatterAggregateError.allSettled(
                [...index.keys].map(key => this.#rm(this.buildStorageKey(contexts, key), index, key)),
                `Error deleting keys of storage context ${contexts.join(".")}`,
            );
        }
    }
}
