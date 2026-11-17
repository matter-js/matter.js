/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Datasource } from "#behavior/state/managed/Datasource.js";
import { MaybePromise, StorageContext, StorageDriver, SupportedStorageTypes } from "@matter/general";
import { Val } from "@matter/protocol";
import { namingStoreFailure, StoreLifecycle } from "./StoreLifecycle.js";

/**
 * Persistence for state values associated with a specific endpoint.
 *
 * The store is active until {@link erase} or {@link close}; after that it never touches storage again, as
 * {@link StoreLifecycle} describes.  A write to an ended store rejects with `StoreClosedError`.
 */
export class EndpointStore {
    protected initialValues = new Map<string, Val.Struct>();

    #storage: StorageContext;
    #lifecycle = new StoreLifecycle(this);

    #knownBehaviors = new Set<string>();
    #loadedValues = false;

    constructor(storage: StorageContext) {
        this.#storage = storage;
    }

    /**
     * Retrieve the primary key used to identify this store.
     */
    get id() {
        return this.storage.thisContexts[this.storage.thisContexts.length - 1];
    }

    /**
     * Extract initial values for a behavior.  Derivatives invoke this when instantiating a store.  The values are then
     * owned by the store.
     */
    protected consumeInitialValues(behaviorId: string) {
        const initialValues = this.initialValues.get(behaviorId);
        if (initialValues !== undefined) {
            this.initialValues.delete(behaviorId);
        }
        return initialValues;
    }

    /**
     * Patch values.  Keyed by {@link Behavior.id} then property name.
     *
     * See {@link Datasource.PersistentStore.set} for the patch semantics the individual structs use.
     *
     * When {@link sharedTx} is provided, writes go through it and the caller owns the transaction lifecycle (no
     * commit/dispose here).  The values then reach storage when the caller commits, after this resolves, so an erase
     * cannot wait for that commit; {@link clearStorage} is where a derivative orders its clear after such a commit.
     *
     * Rejects with `StoreClosedError` once the store is erased or closed, or is ending.
     */
    set(values: Record<string, undefined | Val.Struct>, sharedTx?: StorageDriver.Transaction) {
        return this.#lifecycle.write(() => this.#set(values, sharedTx));
    }

    async #set(values: Record<string, undefined | Val.Struct>, sharedTx?: StorageDriver.Transaction) {
        const ownTx = sharedTx === undefined;
        let tx: StorageDriver.Transaction;

        if (ownTx) {
            const maybeTx = this.storage.begin();
            tx = MaybePromise.is(maybeTx) ? await maybeTx : maybeTx;
        } else {
            tx = sharedTx;
        }

        try {
            const txContext = new StorageContext(tx, this.storage.thisContexts);

            for (const behaviorId in values) {
                const behaviorValues = values[behaviorId];
                const behaviorStorage = txContext.createContext(behaviorId);

                if (behaviorValues === undefined) {
                    if (this.knownBehaviors.has(behaviorId)) {
                        await behaviorStorage.clearAll();
                        this.knownBehaviors.delete(behaviorId);
                    }
                    continue;
                }

                if (!this.knownBehaviors.has(behaviorId)) {
                    this.knownBehaviors.add(behaviorId);
                }

                const toSave = {} as Record<string, SupportedStorageTypes>;
                let keysToSave = 0;
                for (const key in behaviorValues) {
                    const value = behaviorValues[key];
                    if (value === undefined) {
                        await behaviorStorage.delete(key);
                    } else {
                        toSave[key] = value as SupportedStorageTypes;
                        keysToSave++;
                    }
                }
                if (keysToSave > 0) {
                    await behaviorStorage.set(toSave);
                }
            }

            if (ownTx) {
                const committed = tx.commit();
                if (MaybePromise.is(committed)) {
                    await committed;
                }
            }
        } catch (e) {
            if (ownTx) {
                tx![Symbol.dispose]();
            }
            throw e;
        }
    }

    /**
     * Description used in diagnostic messages.
     */
    toString() {
        return `storage:${this.#storage.thisContexts.join(".")}`;
    }

    /**
     * IDs for behaviors persisted in this store.
     */
    get knownBehaviors() {
        return this.#knownBehaviors;
    }

    /**
     * Whether {@link load} found a persisted value.
     */
    get loadedValues() {
        return this.#loadedValues;
    }

    /**
     * Load the store with persisted values.
     */
    async load() {
        this.#knownBehaviors = new Set(await this.storage.contexts());

        for (const behaviorId of this.#knownBehaviors) {
            const behaviorValues = {} as Val.Struct;
            this.initialValues.set(behaviorId, behaviorValues);
            const behaviorStorage = this.storage.createContext(behaviorId);

            const storedValues = await behaviorStorage.values();
            for (const [key, value] of Object.entries(storedValues)) {
                if (value !== undefined) {
                    behaviorValues[key] = value;
                    this.#loadedValues = true;
                }
            }
        }
    }

    /**
     * Remove all persisted information for the {@link Endpoint} and forget the values loaded from it.  Waits for the
     * writes that are running.  The store is erased afterwards, also if clearing the storage fails; a later erase or
     * close behaves as {@link StoreLifecycle} describes.  A failure to clear the storage rejects with a `StorageError`
     * that names the store.
     */
    async erase() {
        await this.#lifecycle.erase(async () => {
            await this.clearStorage(() => namingStoreFailure(this, "erase", () => this.storage.clearAll()));
            this.initialValues.clear();
            this.#knownBehaviors = new Set();
        });
    }

    /**
     * End the store and keep what it persisted.  Waits for the writes that are running.
     */
    async close() {
        await this.#lifecycle.close();
    }

    /**
     * End the store like {@link close}, then run {@link finish}, which may still change the storage of the store.
     */
    protected async closeWith(finish: () => Promise<void>) {
        await this.#lifecycle.close(finish);
    }

    /**
     * Run {@link clear}, which clears storage of the store.  An erase calls this once the store refuses new writes and
     * its running writes ended.  A derivative whose values others stage into transactions they commit themselves runs
     * {@link clear} after those commits.
     */
    protected clearStorage(clear: () => Promise<void>): Promise<void> {
        return clear();
    }

    /**
     * Whether the store neither is erased nor closed, nor is ending.
     */
    get isActive() {
        return this.#lifecycle.isActive;
    }

    /**
     * Remove all persisted information for a single behavior on the {@link Endpoint}.  Rejects with
     * `StoreClosedError` once the store is erased or closed.
     */
    eraseStoreForBehavior(behaviorId: string) {
        return this.#lifecycle.write(async () => this.storage.createContext(behaviorId).clearAll());
    }

    /**
     * Run {@link write} as a write of the store: an erase or close waits for it, and it rejects with
     * `StoreClosedError` once the store ended.  Derivatives write their own keys through this.
     */
    protected write<T>(write: () => Promise<T>) {
        return this.#lifecycle.write(write);
    }

    /**
     * Throws `StoreClosedError` unless the store is active.  Derivatives invoke this before they hand out a store for
     * a behavior.
     */
    protected assertActive(action: string) {
        this.#lifecycle.assertActive(action);
    }

    protected get storage() {
        return this.#storage;
    }
}
