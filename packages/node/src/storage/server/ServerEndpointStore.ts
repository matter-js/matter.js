/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointStore } from "#storage/EndpointStore.js";
import { ImplementationError, MatterAggregateError, StorageContext, SupportedStorageTypes } from "@matter/general";
import type { Val } from "@matter/protocol";
import { DatasourceStore } from "./DatasourceStore.js";

const NUMBER_KEY = "__number__";
const NEXT_NUMBER_KEY = "__nextNumber__";

/**
 * Persistence backing for an {@link Endpoint}.
 *
 * This is the API {@link Endpoint} uses for reading and writing non-volatile values.
 *
 * A store owns the stores of its parts.  A part store that ends leaves the store whether its erase succeeds or not, and
 * a store that is ending or ended throws `StoreClosedError` instead of creating a store for a behavior or a part.
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
     * Create a {@link Datasource.PersistentStore} for a behavior.
     */
    createStoreForBehavior(behaviorId: string) {
        this.assertActive("create a behavior store on");
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
            this.assertActive("create a part store on");
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

    /**
     * Persist the endpoint number of the store.  Rejects with `StoreClosedError` once the store ended.
     */
    async saveNumber() {
        const { number } = this;
        await this.write(async () => {
            if (number === undefined) {
                await this.storage.delete(NUMBER_KEY);
            } else {
                await this.storage.set(NUMBER_KEY, number);
            }
        });
    }

    /**
     * Persist the next endpoint number of the node, which the root store holds.  Rejects with `StoreClosedError` once
     * the store ended.
     */
    async saveNextNumber(nextNumber: number) {
        await this.write(async () => this.storage.set(NEXT_NUMBER_KEY, nextNumber));
    }

    /**
     * The next endpoint number of the node as {@link saveNextNumber} persisted it in {@link storage}.
     */
    static loadNextNumber(storage: StorageContext) {
        return storage.get(NEXT_NUMBER_KEY, 1);
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
     * End the store and the stores of its parts, and keep what they persisted.  The store refuses writes before the
     * stores of its parts end.
     */
    override async close() {
        await this.closeWith(() => this.#closeChildStores());
    }

    /**
     * The stores of the parts end once this store refuses writes, then {@link clear} clears the storage of all, also if
     * a part store fails to close.
     */
    protected override async clearStorage(clear: () => Promise<void>) {
        await MatterAggregateError.settleSeries([() => this.#closeChildStores(), clear], `Error while erasing ${this}`);
    }

    async #closeChildStores() {
        await MatterAggregateError.allSettled(
            Object.values(this.#childStores).map(child => child.close()),
            `Error closing the part stores of ${this}`,
        );
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
        try {
            await store.erase();
        } finally {
            if (this.#childStores[partId] === store) {
                delete this.#childStores[partId];
            }
        }
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
