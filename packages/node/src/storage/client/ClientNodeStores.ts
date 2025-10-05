/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Construction, MatterAggregateError, StorageContext } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import type { Node } from "#node/Node.js";
import { ClientNodeStore } from "./ClientNodeStore.js";

/**
 * Prefix for incrementally assigned client IDs that are usually commissioned, so an increasing ID is used instead the
 * node id.
 */
const CLIENT_ID_PREFIX = "peer";

/**
 * Manages {@link ClientNodeStore}s for a {@link Node}.
 */
export class ClientNodeStores {
    #storage: StorageContext;
    #stores = {} as Record<string, ClientNodeStore>;
    #construction: Construction<ClientNodeStores>;
    #nextAutomaticId = 1;

    get construction() {
        return this.#construction;
    }

    constructor(storage: StorageContext) {
        this.#storage = storage;
        this.#construction = Construction(this);
        this.#construction.start();
    }

    async [Construction.construct]() {
        const contexts = await this.#storage.contexts();

        for (const id of contexts) {
            if (!id.startsWith(CLIENT_ID_PREFIX)) {
                continue;
            }

            const num = Number.parseInt(id.slice(CLIENT_ID_PREFIX.length));
            if (Number.isFinite(num)) {
                if (this.#nextAutomaticId <= num) {
                    this.#nextAutomaticId = num + 1;
                }
            }

            this.#createNodeStore(id);
        }

        await MatterAggregateError.allSettled(
            Object.values(this.#stores).map(store => store.construction.ready),
            "Error while initializing client stores",
        );
    }

    /**
     * Allocate a stable local ID for a peer.
     *
     * The ID may be preassigned or we will assign using an incrementing sequential number.  The number is reserved for
     * the life of this process or, if data is persisted, until erased.
     */
    allocateId() {
        this.#construction.assert();

        return `${CLIENT_ID_PREFIX}${this.#nextAutomaticId++}`;
    }

    /**
     * Obtain the store for a single {@link ClientNode}.
     *
     * These stores are cached internally by ID.
     */
    storeForNode(node: ClientNode): ClientNodeStore {
        this.#construction.assert();

        const store = this.#stores[node.id];
        if (store) {
            return store;
        }

        return this.#createNodeStore(node.id);
    }

    /**
     * List all nodes present.
     */
    get knownIds() {
        this.#construction.assert();

        return Object.keys(this.#stores);
    }

    async close() {
        await this.construction;
    }

    #createNodeStore(id: string) {
        const store = new ClientNodeStore(id, this.#storage.createContext(id));
        store.construction.start();
        this.#stores[id] = store;
        return store;
    }
}
