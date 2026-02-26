/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "#util/Bytes.js";
import type { MaybePromise } from "#util/Promises.js";
import { Storage, StorageError } from "./Storage.js";
import type { SupportedStorageTypes } from "./StringifyTools.js";

export class StorageCommitError extends StorageError {}

/**
 * A transactional wrapper around a {@link Storage}.
 *
 * Use {@link Storage#begin} to create a transaction, then use `await using` for automatic cleanup:
 *
 * ```ts
 * await using tx = storage.begin();
 * tx.set(["ctx"], "key", "value");
 * tx.commit();
 * ```
 *
 * If `commit()` is not called before disposal, the transaction is rolled back.
 */
export class StorageTransaction extends Storage implements AsyncDisposable {
    #committed = false;
    #disposed = false;

    constructor(protected readonly storage: Storage) {
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

    override begin(): MaybePromise<StorageTransaction> {
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

    override clear(completely?: boolean): MaybePromise<void> {
        return this.storage.clear(completely);
    }

    override openBlob(contexts: string[], key: string): MaybePromise<Blob> {
        return this.storage.openBlob(contexts, key);
    }

    override writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): MaybePromise<void> {
        return this.storage.writeBlobFromStream(contexts, key, stream);
    }
}
