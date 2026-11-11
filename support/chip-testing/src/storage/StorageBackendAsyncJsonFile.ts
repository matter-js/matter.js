/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    InternalError,
    MemoryStorageDriver,
    Storage,
    StorageError,
    SupportedStorageTypes,
    fromJson,
    toJson,
} from "@matter/general";
import { readFile, rename, writeFile } from "node:fs/promises";

/**
 * JSON file storage for the CHIP test apps.  Every change is written to the file.  One write runs at a time; changes
 * made while a write runs are written together by the next one, so the file always ends with the latest state.
 */
export class StorageBackendAsyncJsonFile extends Storage {
    private closed = false;
    private store?: MemoryStorageDriver;
    #hasUnsavedChanges = false;
    #writeQueue = Promise.resolve();
    #closing?: Promise<void>;

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
            console.log("StorageBackendAsyncJsonFile: File does not exist yet, initializing with empty store.");
        }
        this.store = new MemoryStorageDriver(data);
        this.store.initialize(); // Internal usage — creates from pre-loaded data
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

    set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
    set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
    async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        const store = this.#storeForChange();
        if (typeof keyOrValues === "string") {
            store.set(contexts, keyOrValues, value);
        } else {
            store.set(contexts, keyOrValues);
        }
        await this.commit();
    }

    override async delete(contexts: string[], key: string) {
        this.#storeForChange().delete(contexts, key);
        await this.commit();
    }

    /** The store for a change.  Refuses changes once {@link close} has started, so no change is kept in memory only. */
    #storeForChange() {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        if (this.closed) {
            throw new StorageError(`Storage ${this.path} is closed.`);
        }
        return this.store;
    }

    private async commit() {
        if (this.store === undefined) {
            throw new InternalError("Storage not initialized.");
        }
        this.#hasUnsavedChanges = true;
        const write = this.#writeQueue.then(() => this.#writeIfUnsaved());
        // The caller receives a write error through `write`; the queue drops it so later commits still run
        this.#writeQueue = write.catch(() => {});
        await write;
    }

    /** Write the current state to the file; resolves once it is written.  Does nothing after {@link close}. */
    async flush() {
        if (this.closed) {
            return;
        }
        await this.commit();
    }

    async #writeIfUnsaved() {
        if (!this.#hasUnsavedChanges || this.store === undefined) {
            return;
        }
        this.#hasUnsavedChanges = false;
        try {
            await this.#writeAndMoveFile(this.path, this.toJson(this.store.data));
        } catch (error) {
            // Commits queued behind this write must retry, not resolve as if their change was stored
            this.#hasUnsavedChanges = true;
            throw error;
        }
    }

    async #writeAndMoveFile(filepath: string, value: string): Promise<void> {
        const tmpName = `${filepath}.tmp`;
        await writeFile(tmpName, value, { encoding: "utf8", flush: true }); // flush does fsync after write
        await rename(tmpName, filepath);
    }

    /** Write the final state and close the store.  Concurrent and repeated calls share the first call's result. */
    override close() {
        return (this.#closing ??= this.#close());
    }

    async #close() {
        if (this.store === undefined) {
            return;
        }
        this.closed = true;
        // Queued after all earlier writes, so it stores the final state and reports its error to the caller
        await this.commit();
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
        this.#storeForChange().clearAll(contexts);
        await this.commit();
    }

    private toJson(object: any) {
        return toJson(object, 1);
    }

    private fromJson(json: string): any {
        return fromJson(json);
    }
}
