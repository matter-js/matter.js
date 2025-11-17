/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import { MaybePromise } from "../util/Promises.js";
import { Storage, StorageError } from "./Storage.js";
import { SupportedStorageTypes } from "./StringifyTools.js";

export interface StorageContextFactory {
    createContext(context: string): StorageContext;
}

export class StorageContext implements StorageContextFactory {
    constructor(
        protected readonly storage: Storage,
        readonly thisContexts: string[],
    ) {}

    get<T extends SupportedStorageTypes>(key: string, defaultValue?: T): MaybePromise<T> {
        const value = this.storage.get(this.thisContexts, key);
        if (value !== undefined) {
            if (MaybePromise.is(value)) {
                return value.then(v => {
                    if (v !== undefined) return v;
                    if (defaultValue === undefined) {
                        throw new StorageError(
                            `No value found for key ${key} in context ${this.thisContexts} and no default value specified`,
                        );
                    }
                    return defaultValue as T;
                }) as MaybePromise<T>;
            }
            return value as T;
        }
        if (defaultValue === undefined) {
            throw new StorageError(
                `No value found for key ${key} in context ${this.thisContexts} and no default value specified`,
            );
        }
        return defaultValue;
    }

    has(key: string) {
        return this.storage.has(this.thisContexts, key);
    }

    set(key: string, value: SupportedStorageTypes): MaybePromise<void>;
    set(values: Record<string, SupportedStorageTypes>): MaybePromise<void>;
    set(keyOrValues: string | Record<string, SupportedStorageTypes>, value?: SupportedStorageTypes) {
        if (typeof keyOrValues === "string") {
            if (keyOrValues.includes(".")) {
                throw new StorageError("Storage keys must not contain dots");
            }
            return this.storage.set(this.thisContexts, keyOrValues, value);
        } else if (keyOrValues === null || typeof keyOrValues !== "object") {
            throw new StorageError("Storage keys must be string or object ok string-value pairs");
        }
        // Validate all keys in the record
        for (const key of Object.keys(keyOrValues)) {
            if (!key) {
                throw new StorageError("Storage keys can not be empty");
            }
            if (key.includes(".")) {
                throw new StorageError("Storage keys must not contain dots");
            }
        }
        return this.storage.set(this.thisContexts, keyOrValues);
    }

    delete(key: string) {
        return this.storage.delete(this.thisContexts, key);
    }

    createContext(context: string): StorageContext {
        if (context.length === 0) throw new StorageError("Context must not be an empty string");
        if (context.includes(".")) throw new StorageError("Context must not contain dots");
        return new StorageContext(this.storage, [...this.thisContexts, context]);
    }

    keys() {
        return this.storage.keys(this.thisContexts);
    }

    values() {
        return this.storage.values(this.thisContexts);
    }

    contexts() {
        return this.storage.contexts(this.thisContexts);
    }

    /** Clears all keys in this context */
    clear() {
        const keys = this.keys();
        if (MaybePromise.is(keys)) {
            return keys.then(keys => {
                return MatterAggregateError.allSettled(
                    keys.map(key => this.delete(key)),
                    "Error while clearing storage",
                ).then(() => {});
            });
        }
        const promises = new Array<PromiseLike<void>>();
        keys.forEach(key => {
            const promise = this.delete(key);
            if (promise !== undefined && MaybePromise.is(promise)) {
                promises.push(promise);
            }
        });
        if (promises.length > 0) {
            return MatterAggregateError.allSettled(promises, "Error while clearing storage").then(() => {});
        }
        return undefined;
    }

    /** Clears all keys in this context and all created sub-contexts. */
    clearAll() {
        return this.storage.clearAll(this.thisContexts);
    }

    openBlob(key: string) {
        return this.storage.openBlob(this.thisContexts, key);
    }

    writeBlobFromStream(key: string, stream: ReadableStream<Bytes>) {
        if (!key) {
            throw new StorageError("Storage keys can not be empty");
        }
        if (key.includes(".")) {
            throw new StorageError("Storage keys must not contain dots");
        }
        return this.storage.writeBlobFromStream(this.thisContexts, key, stream);
    }
}
