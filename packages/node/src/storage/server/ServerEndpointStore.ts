/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import { ImplementationError, StorageContext } from "#general";
import { EndpointStore } from "#storage/EndpointStore.js";
import { DatasourceStore } from "./DatasourceStore.js";

const NUMBER_KEY = "__number__";

/**
 * Persistence backing for an {@link Endpoint}.
 *
 * This is the API {@link Endpoint} uses for reading and writing non-volatile values.
 */
export class ServerEndpointStore extends EndpointStore {
    #number: number | undefined;

    #childStorage: StorageContext;
    #childStores = {} as Record<string, ServerEndpointStore>;

    get number() {
        return this.#number;
    }

    set number(number: number | undefined) {
        if (this.#number !== number) {
            this.#number = number;
        }
    }

    constructor(storage: StorageContext) {
        super(storage);

        this.#childStorage = storage.createContext("parts");
    }

    /**
     * Create a {@link Datasource.Store} for a behavior.
     */
    createStoreForBehavior(behaviorId: string) {
        const initialValues = this.consumeInitialValues(behaviorId);
        return DatasourceStore(this, behaviorId, initialValues);
    }

    /**
     * Invoke a function on this store and the stores of descendant parts.
     */
    visit(fn: (store: ServerEndpointStore) => void) {
        fn(this);
        for (const child of Object.values(this.#childStores)) {
            child.visit(fn);
        }
    }

    childStoreFor(endpoint: Endpoint): ServerEndpointStore {
        if (!endpoint.lifecycle.hasId) {
            throw new ImplementationError("Cannot access endpoint storage because endpoint has no assigned ID");
        }
        return this.storeForPartId(endpoint.id);
    }

    protected storeForPartId(partId: string) {
        let store = this.#childStores[partId];
        if (store === undefined) {
            store = this.#childStores[partId] = new ServerEndpointStore(this.#childStorage.createContext(partId));
        }

        return store;
    }

    async saveNumber() {
        await this.storage.set(NUMBER_KEY, this.number);
    }

    override async load() {
        await super.load();

        const number = await this.storage.get(NUMBER_KEY, -1);
        if (number !== -1) {
            this.#number = number;
        }

        await this.#loadSubparts();
    }

    /**
     * Erase the child storage for one part
     */
    async eraseChildStoreFor(endpoint: Endpoint) {
        const partId = endpoint.id;
        const store = this.#childStores[partId];
        await store.erase();
        delete this.#childStores[partId];
    }

    async #loadSubparts() {
        const knownParts = await this.#childStorage.contexts();
        for (const partId of knownParts) {
            await this.#loadKnownChildStores(partId);
        }
    }

    async #loadKnownChildStores(partId: string) {
        const endpointStore = new ServerEndpointStore(this.#childStorage.createContext(partId));
        this.#childStores[partId] = endpointStore;
        await endpointStore.load();
    }
}
