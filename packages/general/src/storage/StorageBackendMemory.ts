/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { deepCopy } from "#util/DeepCopy.js";
import { CloneableStorage, Storage, StorageError } from "./Storage.js";
import { SupportedStorageTypes } from "./StringifyTools.js";

export class StorageBackendMemory extends Storage implements CloneableStorage {
    protected isInitialized = false;

    constructor(protected store: any = {}) {
        super();
    }

    get initialized() {
        return this.isInitialized;
    }

    static async create(store: any = {}) {
        const storage = new StorageBackendMemory(store);
        storage.initialize();
        return storage;
    }

    private createContextKey(contexts: string[]) {
        const key = contexts.join(".");
        if (!key.length || key.includes("..") || key.startsWith(".") || key.endsWith("."))
            throw new StorageError("Context must not be an empty string.");
        return key;
    }

    initialize() {
        if (this.initialized) throw new StorageError("Storage already initialized!");
        this.isInitialized = true;
        // nothing else to do
    }

    clone() {
        const clone = new StorageBackendMemory(deepCopy(this.store));
        clone.initialize();
        return clone;
    }

    async close() {
        this.isInitialized = false;
        // nothing to do
    }

    clear() {
        this.store = {};
    }

    get data() {
        return this.store;
    }

    get(contexts: string[], key: string): SupportedStorageTypes | undefined {
        this.#assertInitialized();
        if (!contexts.length || !key.length) throw new StorageError("Context and key must not be empty.");
        return this.store[this.createContextKey(contexts)]?.[key];
    }

    openBlob(contexts: string[], key: string): Blob {
        const value = this.get(contexts, key);
        if (value === undefined) {
            return new Blob([]);
        }
        if (!Bytes.isBytes(value)) {
            throw new StorageError("Value must be Bytes to read as blob stream.");
        }
        return new Blob([Bytes.exclusive(value)]);
    }

    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        this.#assertInitialized();
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];

        try {
            let length = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const data = Bytes.of(value);
                chunks.push(data);
                length += data.length;
            }
            const combined = new Uint8Array(length);
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }
            this.#setKey(contexts, key, combined);
        } catch (error: any) {
            throw new StorageError(`Error reading stream: ${error.message}`);
        } finally {
            if (stream.locked) {
                reader.releaseLock(); // Release the reader lock
            }
            await stream.cancel();
        }
    }

    #setKey(contexts: string[], key: string, value: SupportedStorageTypes) {
        if (!contexts.length || !key.length) throw new StorageError("Context and key must not be empty.");
        const contextKey = this.createContextKey(contexts);
        if (this.store[contextKey] === undefined) {
            this.store[contextKey] = {};
        }
        this.store[contextKey][key] = value;
    }

    set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        this.#assertInitialized();
        if (typeof keyOrValues === "string") {
            this.#setKey(contexts, keyOrValues, value);
        } else {
            Object.entries(keyOrValues).forEach(([key, value]) => {
                this.#setKey(contexts, key, value);
            });
        }
    }

    delete(contexts: string[], key: string) {
        this.#assertInitialized();
        if (!contexts.length || !key.length) throw new StorageError("Context and key must not be empty.");
        delete this.store[this.createContextKey(contexts)]?.[key];
    }

    keys(contexts: string[]) {
        this.#assertInitialized();
        if (!contexts.length) throw new StorageError("Context must not be empty!");
        return Object.keys(this.store[this.createContextKey(contexts)] ?? {});
    }

    values(contexts: string[]) {
        // Initialize and context checks are done by keys method
        const values = {} as Record<string, SupportedStorageTypes>;
        for (const key of this.keys(contexts)) {
            values[key] = this.get(contexts, key);
        }
        return values;
    }

    contexts(contexts: string[]) {
        this.#assertInitialized();
        const contextKey = contexts.length ? this.createContextKey(contexts) : "";
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        const foundContexts = new Array<string>();
        Object.keys(this.store).forEach(key => {
            if (key.startsWith(startContextKey)) {
                const subKeys = key.substring(startContextKey.length).split(".");
                if (subKeys.length < 1) return; // should never happen
                const context = subKeys[0];
                if (!foundContexts.includes(context)) {
                    foundContexts.push(context);
                }
            }
        });
        return foundContexts;
    }

    clearAll(contexts: string[]) {
        this.#assertInitialized();
        const contextKey = this.createContextKey(contexts);
        if (contextKey.length) {
            delete this.store[contextKey];
        }
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        Object.keys(this.store).forEach(key => {
            if (key.startsWith(startContextKey)) {
                delete this.store[key];
            }
        });
    }

    #assertInitialized() {
        if (this.initialized) {
            return;
        }

        throw new StorageError("Storage is not initialized");
    }
}
