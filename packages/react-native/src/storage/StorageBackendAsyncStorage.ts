/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Storage, StorageError, SupportedStorageTypes, fromJson, toJson } from "#general";
import AsyncStorage from "@react-native-async-storage/async-storage";

export class StorageBackendAsyncStorage extends Storage {
    #namespace: string;
    protected isInitialized = false;

    /**
     * Creates a new instance of the AsyncStorage storage backend. In a "namespace" is provided then the keys will be
     * prefixed with the namespace (separated with a # which is normally not used in matter.js keys).
     */
    constructor(namespace?: string) {
        super();
        this.#namespace = namespace ?? "";
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

    clear() {
        // @ts-expect-error AsyncStorage types are not correct
        return AsyncStorage.clear();
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
        return `${this.#namespace.length ? `${this.#namespace}#` : ""}${contextKey}`;
    }

    buildStorageKey(contexts: string[], key: string) {
        if (!key.length) {
            throw new StorageError("Key must not be an empty string.");
        }
        const contextKey = this.getContextBaseKey(contexts);
        return `${contextKey}.${key}`;
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        // @ts-expect-error AsyncStorage types are not correct
        const value = await AsyncStorage.getItem(this.buildStorageKey(contexts, key));
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
            // @ts-expect-error AsyncStorage types are not correct
            await AsyncStorage.setItem(this.buildStorageKey(contexts, keyOrValues), toJson(value));
        } else {
            for (const [key, value] of Object.entries(keyOrValues)) {
                // @ts-expect-error AsyncStorage types are not correct
                await AsyncStorage.setItem(this.buildStorageKey(contexts, key), toJson(value));
            }
        }
    }

    delete(contexts: string[], key: string) {
        // @ts-expect-error AsyncStorage types are not correct
        return AsyncStorage.removeItem(this.buildStorageKey(contexts, key));
    }

    /** Returns all keys of a storage context without keys of sub-contexts */
    async keys(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts);
        const keys = [];
        const contextKeyStart = `${contextKey}.`;
        // @ts-expect-error AsyncStorage types are not correct
        const allKeys = await AsyncStorage.getAllKeys();
        for (const key of allKeys) {
            if (key.startsWith(contextKeyStart) && !key.includes(".", contextKeyStart.length)) {
                keys.push(key.substring(contextKeyStart.length));
            }
        }
        return keys;
    }

    async values(contexts: string[]) {
        // Initialize and context checks are done by keys method
        const values = {} as Record<string, SupportedStorageTypes>;
        for (const key of await this.keys(contexts)) {
            values[key] = await this.get(contexts, key);
        }
        return values;
    }

    async contexts(contexts: string[]) {
        const contextKey = this.getContextBaseKey(contexts, true);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        const foundContexts = new Array<string>();
        // @ts-expect-error AsyncStorage types are not correct
        const allKeys = await AsyncStorage.getAllKeys();
        for (const key of allKeys) {
            if (key.startsWith(startContextKey)) {
                const subKeys = key.substring(startContextKey.length).split(".");
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
        const contextKey = this.getContextBaseKey(contexts, true);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        // @ts-expect-error AsyncStorage types are not correct
        const allKeys = await AsyncStorage.getAllKeys();
        for (const key of allKeys) {
            if (key.startsWith(startContextKey)) {
                // @ts-expect-error AsyncStorage types are not correct
                await AsyncStorage.removeItem(key);
            }
        }
    }
}
