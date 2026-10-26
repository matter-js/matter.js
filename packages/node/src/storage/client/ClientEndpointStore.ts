/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointStore } from "#storage/EndpointStore.js";
import { DatasourceStore } from "#storage/server/DatasourceStore.js";
import { ImplementationError, StorageContext, StorageDriver } from "@matter/general";
import type { Val } from "@matter/protocol";
import type { EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import { DatasourceCache } from "./DatasourceCache.js";

/**
 * The context key of a behavior that caches a remote cluster: the cluster ID in canonical decimal.  Local behaviors
 * have names, so the two never share a key.
 */
const CACHE_KEY = /^(0|[1-9]\d*)$/;

export class ClientEndpointStore extends EndpointStore {
    #owner: ClientNodeStore;
    #number: EndpointNumber;
    #caches = new Set<DatasourceCache>();

    constructor(owner: ClientNodeStore, number: EndpointNumber, storage: StorageContext) {
        super(storage);
        this.#owner = owner;
        this.#number = number;
    }

    get number() {
        return this.#number;
    }

    /**
     * Shortcut to persisted peer address so we can use in logging prior to full initialization.
     */
    get peerAddress() {
        return this.initialValues.get("commissioning")?.["peerAddress"];
    }

    /**
     * Whether {@link behaviorId} names the stored cache of a remote cluster rather than the state of a local behavior.
     */
    static isCacheKey(behaviorId: string) {
        return CACHE_KEY.test(behaviorId);
    }

    /**
     * Create a {@link Datasource.ExternallyMutableStore} for the remote cluster with ID {@link behaviorId}.
     *
     * Throws {@link ImplementationError} if {@link behaviorId} is not a cluster ID, as such a cache would neither load
     * nor erase with the others.
     */
    createStoreForBehavior(behaviorId: string) {
        if (!ClientEndpointStore.isCacheKey(behaviorId)) {
            throw new ImplementationError(
                `Cannot cache cluster ${behaviorId} of ${this} under a key that is not its ID`,
            );
        }
        this.assertActive("create a cache on");
        const initialValues = this.consumeInitialValues(behaviorId);
        const cache = new DatasourceCache({
            writer: this.#owner.write,
            nodeId: this.#owner.id,
            endpointNumber: this.#number,
            behaviorId,
            initialValues,
            persist: (transaction, values) => this.persistCache(transaction, behaviorId, values),
            eraseStored: async () => {
                this.#caches.delete(cache);
                await this.eraseStoreForBehavior(behaviorId);
            },
            buffer: this.#owner.buffer,
        });
        this.#caches.add(cache);
        return cache;
    }

    /**
     * Stage the values of the cache of {@link behaviorId} into {@link transaction}, which the
     * {@link ClientCacheBuffer} commits.  Rejects with `StoreClosedError` once the store is ending or ended.
     */
    persistCache(transaction: StorageDriver.Transaction, behaviorId: string, values: Val.Struct) {
        return this.set({ [behaviorId]: values }, transaction);
    }

    /**
     * Erase the values cached from the peer, keep the state of behaviors that do not track a remote cluster, and close
     * the store.  A new store over the same storage loads what remains.
     *
     * A context counts as cached if {@link isCacheKey} accepts its key.  Anything else stays, so local state such as
     * commissioning survives even if its behavior did not start.
     */
    async eraseCaches() {
        await this.closeWith(() =>
            this.clearStorage(async () => {
                for (const behaviorId of await this.storage.contexts()) {
                    if (ClientEndpointStore.isCacheKey(behaviorId)) {
                        await this.storage.createContext(behaviorId).clearAll();
                    }
                }
            }),
        );
    }

    /**
     * Discard the caches, then run {@link clear} as a job of the buffer, after the flushes that may have staged their
     * values before the store began to refuse writes.
     */
    protected override clearStorage(clear: () => Promise<void>) {
        for (const cache of this.#caches) {
            cache.discard();
        }
        this.#caches.clear();
        return this.#owner.buffer?.clear(clear) ?? clear();
    }

    /**
     * Create a {@link Datasource.Store} for a behavior that does not track a remote cluster.
     *
     * Throws {@link ImplementationError} if {@link behaviorId} is a cluster ID, as an erase of the cache would take the
     * state of the behavior with it.
     */
    createStoreForLocalBehavior(behaviorId: string) {
        if (ClientEndpointStore.isCacheKey(behaviorId)) {
            throw new ImplementationError(`Cannot store local behavior ${behaviorId} of ${this} under a cluster ID`);
        }
        this.assertActive("create a behavior store on");
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceStore(this, behaviorId, initialValues);
    }
}
