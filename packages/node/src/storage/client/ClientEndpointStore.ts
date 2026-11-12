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
        for (const cache of this.#caches) {
            cache.discard();
        }
        this.#caches.clear();
        await super.erase();
    }

    /**
     * Create a {@link Datasource.PersistentStore} for a behavior that does not track a remote cluster.
     */
    createStoreForLocalBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceStore(this, behaviorId, initialValues);
    }
}
