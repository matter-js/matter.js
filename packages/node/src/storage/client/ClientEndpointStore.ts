/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointStore } from "#storage/EndpointStore.js";
import { DatasourceStore } from "#storage/server/DatasourceStore.js";
import { StorageContext } from "@matter/general";
import type { EndpointNumber } from "@matter/types";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import { DatasourceCache } from "./DatasourceCache.js";

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
     * Create a {@link Datasource.ExternallyMutableStore} for a behavior.
     */
    createStoreForBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        const cache = new DatasourceCache({
            writer: this.#owner.write,
            nodeId: this.#owner.id,
            endpointNumber: this.#number,
            behaviorId,
            initialValues,
            localWriter: this.#owner.localWriter,
            buffer: this.#owner.buffer,
        });
        this.#caches.add(cache);
        return cache;
    }

    override async erase() {
        await this.#discardCaches();
        await super.erase();
    }

    /**
     * Erase the values cached from the peer and keep the state of behaviors that do not track a remote cluster.
     *
     * A behavior counts as cached if its persisted values carry a data version, which every cache flush writes.
     * Anything else stays, so local state such as commissioning survives even if its behavior did not start.
     */
    async eraseCaches() {
        await this.#discardCaches();
        for (const behaviorId of await this.storage.contexts()) {
            if (await this.storage.createContext(behaviorId).has(DatasourceCache.VERSION_KEY)) {
                await this.eraseStoreForBehavior(behaviorId);
            }
        }
    }

    async #discardCaches() {
        for (const cache of this.#caches) {
            cache.discard();
        }
        this.#caches.clear();

        // A running flush may still write the values of a discarded cache, so it must finish before the storage clears
        await this.#owner.buffer?.settled();
    }

    /**
     * Create a {@link Datasource.Store} for a behavior that does not track a remote cluster.
     */
    createStoreForLocalBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceStore(this, behaviorId, initialValues);
    }
}
