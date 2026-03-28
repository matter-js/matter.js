/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { StorageDriver, StorageError } from "./StorageDriver.js";
import { SupportedStorageTypes, fromJson, toJson } from "./StringifyTools.js";

/**
 * Async key-value interface that web-style storage backends must implement.
 *
 * Mirrors the subset of the `@react-native-async-storage/async-storage` v3 API that storage drivers actually use.
 */
export interface WebStorageProvider {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    getAllKeys(): Promise<string[]>;
    getMany(keys: string[]): Promise<Record<string, string | null>>;
    setMany(entries: Record<string, string>): Promise<void>;
    removeMany(keys: string[]): Promise<void>;
    clear(): Promise<void>;
}

/**
 * {@link StorageDriver} for web-style async key-value stores.
 *
 * Shared implementation for any backend that satisfies the {@link WebStorageProvider} interface (e.g. React Native
 * AsyncStorage v2/v3, browser localStorage wrapper, etc.).
 */
export class WebStorageDriver extends StorageDriver {
    #storage: WebStorageProvider;
    #initialized = false;

    constructor(storage: WebStorageProvider) {
        super();
        this.#storage = storage;
    }

    get initialized() {
        return this.#initialized;
    }

    initialize() {
        if (this.#initialized) {
            throw new StorageError("Storage already initialized!");
        }
        this.#initialized = true;
    }

    close() {
        this.#initialized = false;
    }

    override clear() {
        return this.#storage.clear();
    }

    getContextBaseKey(contexts: string[]) {
        for (const ctx of contexts) {
            if (!ctx.length || ctx.includes(".")) {
                throw new StorageError(
                    "Context must not contain empty segments or leading or trailing dots.",
                );
            }
        }
        return contexts.join(".");
    }

    buildStorageKey(contexts: string[], key: string) {
        if (!key.length) {
            throw new StorageError("Key must not be an empty string.");
        }
        const contextKey = this.getContextBaseKey(contexts);
        return contextKey.length ? `${contextKey}.${key}` : key;
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        const value = await this.#storage.getItem(this.buildStorageKey(contexts, key));
        if (value === null) return undefined;
        return fromJson(value) as T;
    }

    async openBlob(_contexts: string[], _key: string): Promise<Blob> {
        throw new StorageError("Blob storage is not supported by WebStorageDriver.");
    }

    async writeBlobFromStream(_contexts: string[], _key: string, _stream: ReadableStream<Bytes>): Promise<void> {
        throw new StorageError("Blob storage is not supported by WebStorageDriver.");
    }

    set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
    set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
    async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ) {
        if (typeof keyOrValues === "string") {
            await this.#storage.setItem(this.buildStorageKey(contexts, keyOrValues), toJson(value));
        } else {
            const entries = {} as Record<string, string>;
            for (const [key, value] of Object.entries(keyOrValues)) {
                entries[this.buildStorageKey(contexts, key)] = toJson(value);
            }
            await this.#storage.setMany(entries);
        }
    }

    delete(contexts: string[], key: string) {
        return this.#storage.removeItem(this.buildStorageKey(contexts, key));
    }

    async keys(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts);
        const keys = [];
        const allKeys = await this.#storage.getAllKeys();
        if (contextKey.length) {
            const contextKeyStart = `${contextKey}.`;
            for (const key of allKeys) {
                if (key.startsWith(contextKeyStart) && !key.includes(".", contextKeyStart.length)) {
                    keys.push(key.substring(contextKeyStart.length));
                }
            }
        } else {
            for (const key of allKeys) {
                if (!key.includes(".")) {
                    keys.push(key);
                }
            }
        }
        return keys;
    }

    async values(contexts: string[]) {
        const keys = await this.keys(contexts);
        const storageKeys = keys.map(key => this.buildStorageKey(contexts, key));
        const entries = await this.#storage.getMany(storageKeys);
        const values = {} as Record<string, SupportedStorageTypes>;
        for (const [index, key] of keys.entries()) {
            const value = entries[storageKeys[index]];
            if (value !== null && value !== undefined) {
                values[key] = fromJson(value) as SupportedStorageTypes;
            }
        }
        return values;
    }

    async contexts(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        const foundContexts = new Set<string>();
        const allKeys = await this.#storage.getAllKeys();
        for (const key of allKeys) {
            if (key.startsWith(startContextKey)) {
                const subKeys = key.substring(startContextKey.length).split(".");
                if (subKeys.length === 1) continue; // found leaf key
                const context = subKeys[0];
                foundContexts.add(context);
            }
        }
        return Array.from(foundContexts);
    }

    async clearAll(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        const allKeys = await this.#storage.getAllKeys();
        const keysToDelete = [];
        for (const key of allKeys) {
            if (key.startsWith(startContextKey)) {
                keysToDelete.push(key);
            }
        }
        if (keysToDelete.length) {
            await this.#storage.removeMany(keysToDelete);
        }
    }
}
