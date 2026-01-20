/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Bytes } from "#util/Bytes.js";
import { ImplementationError, MatterError } from "../MatterError.js";
import { MaybePromise } from "../util/Promises.js";
import { SupportedStorageTypes } from "./StringifyTools.js";

export class StorageError extends MatterError {}

/**
 * Matter.js uses this key/value API to manage persistent state.
 */
export abstract class Storage {
    abstract readonly initialized: boolean;
    abstract initialize(): MaybePromise<void>;
    abstract close(): MaybePromise<void>;
    abstract get(contexts: string[], key: string): MaybePromise<SupportedStorageTypes | undefined>;
    abstract set(contexts: string[], values: Record<string, SupportedStorageTypes>): MaybePromise<void>;
    abstract set(contexts: string[], key: string, value: SupportedStorageTypes): MaybePromise<void>;
    abstract delete(contexts: string[], key: string): MaybePromise<void>;
    abstract keys(contexts: string[]): MaybePromise<string[]>;
    abstract values(contexts: string[]): MaybePromise<Record<string, SupportedStorageTypes>>;
    abstract contexts(contexts: string[]): MaybePromise<string[]>;
    abstract clearAll(contexts: string[]): MaybePromise<void>;
    // TODO: use `completely` variable for removing storage completely
    abstract clear(completely?: boolean): MaybePromise<void>;

    /**
     * Checks if a key exists in the storage for the given contexts.
     * Important Note: This default implementation just reads the value for the key and checks if it is undefined.
     * Please implement this method in your storage implementation if you want to optimize it.
     */
    has(contexts: string[], key: string): MaybePromise<boolean> {
        const value = this.get(contexts, key);
        if (MaybePromise.is(value)) {
            return MaybePromise.then(value, v => v !== undefined);
        }
        return value !== undefined;
    }

    abstract openBlob(contexts: string[], key: string): MaybePromise<Blob>;
    abstract writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): MaybePromise<void>;
}

/**
 * Extended interface for storage that supports snapshotting.
 */
export interface CloneableStorage {
    clone(): MaybePromise<Storage>;
}

export namespace CloneableStorage {
    export function is<T extends {}>(storage: T): storage is T & CloneableStorage {
        return "clone" in storage && typeof storage.clone === "function";
    }

    export function assert<T extends {}>(storage: T): asserts storage is T & CloneableStorage {
        if (!is(storage)) {
            throw new ImplementationError("Storage does not support required snapshotting function");
        }
    }
}
