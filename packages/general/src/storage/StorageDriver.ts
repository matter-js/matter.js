/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Bytes } from "#util/Bytes.js";
import type { Directory } from "../fs/Directory.js";
import { ImplementationError, MatterError } from "../MatterError.js";
import { MaybePromise } from "../util/Promises.js";
import { SupportedStorageTypes } from "./StringifyTools.js";

export class StorageError extends MatterError {}

export class StorageCommitError extends StorageError {}

/**
 * Matter.js uses this key/value API to manage persistent state.
 */
export abstract class StorageDriver {
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
    /** @deprecated Use {@link clearAll} instead. */
    clear(_completely?: boolean): MaybePromise<void> {
        throw new StorageError("clear() is deprecated; use clearAll() instead");
    }

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

    begin(): MaybePromise<StorageDriver.Transaction> {
        return new StorageDriver.Transaction(this);
    }
}

export namespace StorageDriver {
    /**
     * Serializable descriptor stored as `driver.json` inside the storage directory.  The `kind` field identifies the
     * driver implementation.  Drivers extend this with optional fields for driver-specific options so that a plain
     * `{ kind }` is always a valid descriptor for any driver.
     */
    export interface Descriptor {
        kind: string;
    }

    /**
     * Static interface that a registerable driver class must satisfy.
     */
    export interface Implementation<D extends Descriptor = Descriptor> {
        /** Short identifier such as `"file"`, `"sqlite"`, `"wal"`, or `"memory"`. */
        id: string;

        /** Create a storage driver for the given directory and descriptor. */
        create(dir: Directory, descriptor: D): MaybePromise<StorageDriver>;

        /**
         * Optional hook called before {@link create}.  Allows the driver to rearrange files on disk (e.g. move a
         * legacy `.db` file into its directory).  If no directory exists after this call, `driver.json` will not be
         * written.
         */
        preinitialize?(parentDir: Directory, descriptor: D): MaybePromise<void>;
    }

    /**
     * A transactional wrapper around a {@link StorageDriver}.
     *
     * Use {@link StorageDriver#begin} to create a transaction, then use `await using` for automatic cleanup:
     *
     * ```ts
     * await using tx = storage.begin();
     * tx.set(["ctx"], "key", "value");
     * tx.commit();
     * ```
     *
     * If `commit()` is not called before disposal, the transaction is rolled back.
     */
    export class Transaction extends StorageDriver implements Disposable, AsyncDisposable {
        #committed = false;
        #disposed = false;

        constructor(protected readonly storage: StorageDriver) {
            super();
        }

        get committed() {
            return this.#committed;
        }

        get disposed() {
            return this.#disposed;
        }

        protected assertActive() {
            if (this.#disposed) {
                throw new StorageCommitError("Transaction is disposed");
            }
            if (this.#committed) {
                throw new StorageCommitError("Transaction is already committed");
            }
        }

        commit(): MaybePromise<void> {
            this.assertActive();
            this.#committed = true;
        }

        protected rollback(): MaybePromise<void> {
            // No-op in base class; override point for subclasses
        }

        [Symbol.dispose]() {
            if (this.#disposed) {
                return;
            }
            this.#disposed = true;
            if (!this.#committed) {
                this.rollback();
            }
        }

        async [Symbol.asyncDispose]() {
            if (this.#disposed) {
                return;
            }
            this.#disposed = true;
            if (!this.#committed) {
                await this.rollback();
            }
        }

        // Storage abstract method implementations — delegate to wrapped storage

        override get initialized() {
            return this.storage.initialized;
        }

        override initialize(): MaybePromise<void> {
            throw new StorageCommitError("Cannot initialize storage from a transaction");
        }

        override close(): MaybePromise<void> {
            throw new StorageCommitError("Cannot close storage from a transaction");
        }

        override begin(): MaybePromise<Transaction> {
            throw new StorageCommitError("Nested transactions are not supported");
        }

        override get(contexts: string[], key: string): MaybePromise<SupportedStorageTypes | undefined> {
            return this.storage.get(contexts, key);
        }

        override set(contexts: string[], values: Record<string, SupportedStorageTypes>): MaybePromise<void>;
        override set(contexts: string[], key: string, value: SupportedStorageTypes): MaybePromise<void>;
        override set(
            contexts: string[],
            keyOrValues: string | Record<string, SupportedStorageTypes>,
            value?: SupportedStorageTypes,
        ): MaybePromise<void> {
            if (typeof keyOrValues === "string") {
                return this.storage.set(contexts, keyOrValues, value!);
            }
            return this.storage.set(contexts, keyOrValues);
        }

        override delete(contexts: string[], key: string): MaybePromise<void> {
            return this.storage.delete(contexts, key);
        }

        override keys(contexts: string[]): MaybePromise<string[]> {
            return this.storage.keys(contexts);
        }

        override values(contexts: string[]): MaybePromise<Record<string, SupportedStorageTypes>> {
            return this.storage.values(contexts);
        }

        override contexts(contexts: string[]): MaybePromise<string[]> {
            return this.storage.contexts(contexts);
        }

        override clearAll(contexts: string[]): MaybePromise<void> {
            return this.storage.clearAll(contexts);
        }

        /** @deprecated Use {@link clearAll} instead. */
        override clear(_completely?: boolean): MaybePromise<void> {
            throw new StorageError("clear() is deprecated; use clearAll() instead");
        }

        override openBlob(contexts: string[], key: string): MaybePromise<Blob> {
            return this.storage.openBlob(contexts, key);
        }

        override writeBlobFromStream(
            contexts: string[],
            key: string,
            stream: ReadableStream<Bytes>,
        ): MaybePromise<void> {
            return this.storage.writeBlobFromStream(contexts, key, stream);
        }
    }
}

/**
 * @deprecated Use {@link StorageDriver}.
 */
export const Storage = StorageDriver;

/**
 * @deprecated Use {@link StorageDriver}.
 */
export interface Storage extends StorageDriver {}

/**
 * Extended interface for storage that supports snapshotting.
 */
export interface CloneableStorage {
    clone(): MaybePromise<StorageDriver>;
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
