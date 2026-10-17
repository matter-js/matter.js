/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointStore } from "#storage/EndpointStore.js";
import { ImplementationError, StorageContext, SupportedStorageTypes } from "@matter/general";
import type { Val } from "@matter/protocol";
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

    /**
     * ID path of the endpoint below its node root; empty for the root.
     */
    readonly path: string;

    constructor(storage: StorageContext, path = "") {
        super(storage);

        this.path = path;

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

    /**
     * The store of the part with ID {@link partId} if it exists, without creating one.
     */
    existingChildStore(partId: string): ServerEndpointStore | undefined {
        return this.#childStores[partId];
    }

    protected storeForPartId(partId: string) {
        let store = this.#childStores[partId];
        if (store === undefined) {
            store = this.#childStores[partId] = new ServerEndpointStore(
                this.#childStorage.createContext(partId),
                this.#childPath(partId),
            );
        }

        return store;
    }

    /**
     * Persist values for behaviors that have not started on a store that was just created.  The behaviors start with
     * these values.  {@link load} cannot be used for this because it would replace the child stores.
     *
     * @internal
     */
    async preset(values: Record<string, Val.Struct>) {
        await this.set(values);
        for (const behaviorId in values) {
            this.initialValues.set(behaviorId, { ...this.initialValues.get(behaviorId), ...values[behaviorId] });
        }
    }

    /**
     * The persisted value of a behavior property, if one is stored.
     */
    async storedValue(behaviorId: string, key: string): Promise<SupportedStorageTypes | undefined> {
        const context = this.storage.createContext(behaviorId);
        if (!(await context.has(key))) {
            return undefined;
        }
        return context.get(key);
    }

    async saveNumber() {
        if (this.number === undefined) {
            await this.storage.delete(NUMBER_KEY);
            return;
        }
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
        if (store === undefined) {
            return;
        }
        await store.erase();
        delete this.#childStores[partId];
    }

    #childPath(partId: string) {
        return this.path === "" ? partId : `${this.path}.${partId}`;
    }

    async #loadSubparts() {
        const knownParts = await this.#childStorage.contexts();
        for (const partId of knownParts) {
            await this.#loadKnownChildStores(partId);
        }
    }

    async #loadKnownChildStores(partId: string) {
        const endpointStore = new ServerEndpointStore(
            this.#childStorage.createContext(partId),
            this.#childPath(partId),
        );
        this.#childStores[partId] = endpointStore;
        await endpointStore.load();
    }
}
