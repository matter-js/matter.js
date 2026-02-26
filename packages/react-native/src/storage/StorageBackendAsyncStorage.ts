/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StorageDriver, StorageError, SupportedStorageTypes, fromJson, toJson } from "@matter/general";
import { createAsyncStorage, type AsyncStorage } from "@react-native-async-storage/async-storage";

/**
 * AsyncStorage backend based on AsyncStorage v3 scoped instances.
 *
 * This backend uses `createAsyncStorage(...)`, so each backend instance stores
 * data in its own scoped storage area. It is the default backend for
 * `@matter/react-native` with async-storage `3.x`.
 *
 * For migration scenarios that need legacy v2-compatible singleton storage
 * behavior, use {@link StorageBackendAsyncStorageV2} from
 * `@matter/react-native/storage` instead.
 */
export class StorageBackendAsyncStorage extends StorageDriver {
    #storage: AsyncStorage;
    protected isInitialized = false;

    /** Creates a namespaced storage area when AsyncStorage v3 is available. */
    constructor(namespace?: string) {
        super();
        this.#storage = createAsyncStorage(namespace ?? "matterjs");
    }

    get initialized() {
        return this.isInitialized;
    }

    initialize() {
        this.isInitialized = true;
    }

    close() {
        this.isInitialized = false;
    }

    override clear() {
        return this.#storage.clear();
    }

    getContextBaseKey(contexts: string[], allowEmptyContext = false) {
        const contextKey = contexts.join(".");
        if (
            (!contextKey.length && !allowEmptyContext) ||
            contextKey.includes("..") ||
            contextKey.startsWith(".") ||
            contextKey.endsWith(".")
        )
            throw new StorageError(
                "Context must not be empty and must not contain empty segments or leading or trailing dots.",
            );
        return contextKey;
    }

    buildStorageKey(contexts: string[], key: string) {
        if (!key.length) {
            throw new StorageError("Key must not be an empty string.");
        }
        const contextKey = this.getContextBaseKey(contexts);
        return `${contextKey}.${key}`;
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        const value = await this.#storage.getItem(this.buildStorageKey(contexts, key));
        if (value === null) return undefined;
        return fromJson(value) as T;
    }

    async openBlob(_contexts: string[], _key: string): Promise<Blob> {
        throw new StorageError("Streams not supported currently in AsyncStorage backend.");
    }

    async writeBlobFromStream(_contexts: string[], _key: string, _stream: ReadableStream<Bytes>): Promise<void> {
        throw new StorageError("Streams not supported currently in AsyncStorage backend.");
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

    /** Returns all keys of a storage context without keys of sub-contexts */
    async keys(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts);
        const keys = [];
        const contextKeyStart = `${contextKey}.`;
        const allKeys = await this.#storage.getAllKeys();
        for (const key of allKeys) {
            if (key.startsWith(contextKeyStart) && !key.includes(".", contextKeyStart.length)) {
                keys.push(key.substring(contextKeyStart.length));
            }
        }
        return keys;
    }

    async values(contexts: string[]) {
        // Initialize and context checks are done by keys method
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
        const contextKey = this.getContextBaseKey(contexts, true);
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
        const contextKey = this.getContextBaseKey(contexts, true);
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
