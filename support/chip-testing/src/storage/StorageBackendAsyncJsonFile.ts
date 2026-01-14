/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    InternalError,
    Storage,
    StorageBackendMemory,
    SupportedStorageTypes,
    Time,
    createPromise,
    fromJson,
    toJson,
} from "@matter/general";
import { readFile, rename, writeFile } from "node:fs/promises";

export class StorageBackendAsyncJsonFile extends Storage {
    /** We store changes after a value was set to the storage, but not more often than this setting (in ms). */
    private closed = false;
    private store?: StorageBackendMemory;
    private currentStoreItPromise?: Promise<void>;
    private lastStoredTime = 0;

    constructor(readonly path: string) {
        super();
    }

    async initialize() {
        let data: any = {};
        try {
            data = this.fromJson(await readFile(this.path, "utf8"));
        } catch (error: any) {
            // We accept that the file does not exist yet to initialize with an empty store.
            if (error.code !== "ENOENT") {
                throw error;
            }
            console.log("StorageBackendSyncJsonFile: File does not exist yet, initializing with empty store.");
        }
        this.store = new StorageBackendMemory(data);
        this.store.initialize();
        this.lastStoredTime = Time.nowMs;
    }

    get initialized() {
        return this.store?.initialized ?? false;
    }

    override async has(contexts: string[], key: string): Promise<boolean> {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        return this.store.has(contexts, key);
    }

    override async get(contexts: string[], key: string): Promise<SupportedStorageTypes | undefined> {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        return this.store.get(contexts, key);
    }

    async openBlob(contexts: string[], key: string): Promise<Blob> {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        return this.store.openBlob(contexts, key);
    }

    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        await this.store.writeBlobFromStream(contexts, key, stream);
        await this.commit();
    }

    set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
    set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
    async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        if (typeof keyOrValues === "string") {
            this.store.set(contexts, keyOrValues, value);
        } else {
            this.store.set(contexts, keyOrValues);
        }
        await this.commit();
    }

    override async delete(contexts: string[], key: string) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        this.store.delete(contexts, key);
        await this.commit();
    }

    async clear() {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        this.store.clear();
        await this.commit();
    }

    private async commit() {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        if (this.closed) return;
        if (this.currentStoreItPromise !== undefined) {
            return;
        }
        await this.storeIt();
    }

    async storeIt(forced = false) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        if (this.closed) return;
        if (!forced && this.lastStoredTime < Time.nowMs - 1000) {
            return;
        }
        if (this.currentStoreItPromise !== undefined) {
            await this.currentStoreItPromise;
        }

        const { promise, rejecter, resolver } = createPromise<void>();
        const json = this.toJson(this.store.data);
        this.#writeAndMoveFile(this.path, json)
            .then(resolver, rejecter)
            .finally(() => {
                this.currentStoreItPromise = undefined;
            });
        this.currentStoreItPromise = promise;
        return promise;
    }

    async #writeAndMoveFile(filepath: string, value: string): Promise<void> {
        const tmpName = `${filepath}.tmp`;
        await writeFile(tmpName, value, { encoding: "utf8", flush: true }); // flush does fsync after write
        await rename(tmpName, filepath);
    }

    override async close() {
        if (this.store === undefined) {
            return;
        }
        await this.storeIt(true);
        this.closed = true;
        await this.store.close();
    }

    override async keys(contexts: string[]) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        return this.store.keys(contexts);
    }

    override async values(contexts: string[]) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        return this.store.values(contexts);
    }

    override async contexts(contexts: string[]) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        return this.store.contexts(contexts);
    }

    override async clearAll(contexts: string[]) {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        this.store.clearAll(contexts);
        await this.commit();
    }

    private toJson(object: any) {
        return toJson(object, 1);
    }

    private fromJson(json: string): any {
        return fromJson(json);
    }
}
