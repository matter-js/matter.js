/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#endpoint/Endpoint.js";
import type { ClientNode } from "#node/ClientNode.js";
import { InternalError, MatterAggregateError, StorageContext, StorageContextFactory } from "@matter/general";
import { EndpointNumber } from "@matter/types";
import { NodeStore } from "../NodeStore.js";
import { namingStoreFailure, StoreClosedError, StoreLifecycle } from "../StoreLifecycle.js";
import type { ClientCacheBuffer } from "./ClientCacheBuffer.js";
import { ClientEndpointStore } from "./ClientEndpointStore.js";
import type { RemoteWriter } from "./RemoteWriter.js";

const FABRIC_FILTERED_KEY = "fabricFiltered";
const DISABLED_KEY = "isDisabled";

/**
 * {@link ClientNode} persistence.
 *
 * The store is active until {@link erase}, {@link eraseCaches} or {@link close}; after that it never touches storage
 * again, as {@link StoreLifecycle} describes.  {@link ClientNodeStores} hands out a new store for the node after
 * {@link eraseCaches}.
 */
export class ClientNodeStore extends NodeStore {
    #id: string;
    #storage?: StorageContext;
    #cacheStorage?: StorageContext;
    #cacheFabricFiltered?: boolean;
    #settingsStorage?: StorageContext;
    #isDisabled = false;
    #stores = new Map<EndpointNumber, ClientEndpointStore>();
    #write?: RemoteWriter;
    #buffer?: ClientCacheBuffer;
    #isPreexisting: boolean;
    #lifecycle = new StoreLifecycle(this);

    constructor(id: string, storage: StorageContextFactory, isPreexisting: boolean) {
        super(storage);
        this.#id = id;
        this.#isPreexisting = isPreexisting;
    }

    override toString() {
        return `client-node-store#${this.#id}`;
    }

    get id() {
        return this.#id;
    }

    get isPreexisting() {
        return this.#isPreexisting;
    }

    get write() {
        if (this.#write === undefined) {
            throw new InternalError("Write attempt on ClientNodeStore without writer installed");
        }

        return this.#write;
    }

    set write(write: RemoteWriter) {
        this.#write = write;
    }

    /**
     * The buffer the caches of the store persist through.  Must be set before the first cache on the store is created,
     * as a cache without a buffer persists nothing.
     */
    get buffer() {
        return this.#buffer;
    }

    set buffer(buffer: ClientCacheBuffer | undefined) {
        this.#buffer = buffer;
    }

    /**
     * The fabric filter of the interactions the cached cluster data and data versions come from, or undefined if not
     * recorded yet.
     */
    get cacheFabricFiltered() {
        return this.#cacheFabricFiltered;
    }

    /**
     * Record the fabric filter of the cache in storage.
     */
    async recordCacheFabricFiltered(fabricFiltered: boolean) {
        const cacheStorage = this.#cacheStorage;
        if (cacheStorage === undefined) {
            throw new InternalError(`Cache storage of ${this} accessed before load`);
        }
        await this.#lifecycle.write(async () => cacheStorage.set(FABRIC_FILTERED_KEY, fabricFiltered));
        this.#cacheFabricFiltered = fabricFiltered;
    }

    /**
     * Whether the node is disabled, as {@link recordNodeDisabled} persisted it.
     *
     * @internal
     */
    get isNodeDisabled() {
        return this.#isDisabled;
    }

    /**
     * Persist whether the node is disabled.  The flag lives in the store, not in behavior state, as the node reads it
     * synchronously when it initializes, before its behaviors load, and a crashed node must still persist it.
     *
     * @internal
     */
    async recordNodeDisabled(isDisabled: boolean) {
        const settingsStorage = this.#settingsStorage;
        if (settingsStorage === undefined) {
            throw new InternalError(`Settings storage of ${this} accessed before load`);
        }
        if (isDisabled === this.#isDisabled) {
            return;
        }
        await this.#lifecycle.write(async () => settingsStorage.set(DISABLED_KEY, isDisabled));
        this.#isDisabled = isDisabled;
    }

    get endpointStores() {
        return this.#stores.values();
    }

    /**
     * The peer address persisted for the node, read without creating a store.
     */
    get peerAddress() {
        return this.#stores.get(EndpointNumber(0))?.peerAddress;
    }

    storeForEndpointNumber(endpointNumber: EndpointNumber) {
        const store = this.#stores.get(endpointNumber);
        if (store === undefined) {
            throw new InternalError(`No endpoint store for endpoint ${endpointNumber}`);
        }
        return store;
    }

    /**
     * Remove everything persisted for the node and end the store.  Use {@link ClientNodeStores.eraseStore}, which
     * stops handing the store out first.  The outcome of a later erase or close follows {@link StoreLifecycle}.
     */
    override async erase() {
        await this.#lifecycle.erase(() => this.#wipe());
    }

    async #wipe() {
        const stores = [...this.#stores.values()];
        await MatterAggregateError.settleSeries(
            [
                // The endpoint stores end first, so a flush that staged their values commits before the storage clears
                ...stores.map(store => () => store.erase()),

                () => {
                    this.#stores = new Map();
                    return this.#storage?.clearAll();
                },

                () => {
                    this.#cacheFabricFiltered = undefined;
                    return this.#cacheStorage?.clearAll();
                },

                () => {
                    this.#isDisabled = false;
                    return this.#settingsStorage?.clearAll();
                },

                () => this.construction.close(),
            ],
            `Error while erasing ${this}`,
        );
    }

    /**
     * Erase the values cached from the peer, including the recorded fabric filter of the cache, and end the store.  The
     * state of behaviors that do not track a remote cluster and the disabled flag stay; see
     * {@link ClientEndpointStore.eraseCaches}.  Use {@link ClientNodeStores.eraseCaches}, which hands out a new store
     * that loads what remains.
     */
    async eraseCaches() {
        const stores = [...this.#stores.values()];
        await this.#lifecycle.close(async () => {
            try {
                await MatterAggregateError.settleSeries(
                    [
                        ...stores.map(store => () => store.eraseCaches()),
                        () =>
                            namingStoreFailure(this, "erase the cache fabric filter of", async () => {
                                await this.#cacheStorage?.clearAll();
                            }),
                    ],
                    `Error while erasing the cache of ${this}`,
                );
            } finally {
                await this.construction.close();
            }
        });
    }

    /**
     * End the store and keep what it persisted.
     */
    async close() {
        await this.#lifecycle.close(async () => {
            await MatterAggregateError.allSettled(
                [...this.#stores.values()].map(store => store.close()),
                `Error while closing ${this}`,
            );
            await this.construction.close();
        });
    }

    /**
     * Erase the store of the endpoint with {@link number}.  The next {@link storeForEndpoint} hands out a new one.
     */
    async eraseEndpointStore(number: EndpointNumber) {
        const store = this.#stores.get(number);
        if (store === undefined) {
            return;
        }
        try {
            await store.erase();
        } finally {
            // A failed erase still ends the store, which must not be handed out again
            if (this.#stores.get(number) === store) {
                this.#stores.delete(number);
            }
        }
    }

    /**
     * The store of {@link endpoint}, created on first use.
     *
     * Throws `StoreClosedError` for an endpoint that holds no store once a delete or close that destroys it was
     * requested, also one of an ancestor, as the delete may have erased the store already: an endpoint that is being
     * destroyed persists nothing new.
     */
    override storeForEndpoint(endpoint: Endpoint) {
        const { number } = endpoint;

        if (this.#storage === undefined) {
            throw new InternalError(`Endpoint storage ${this.toString()}.endpoints.${number} accessed before load`);
        }
        this.#lifecycle.assertActive(`hand out the store of endpoint ${number} of`);

        let store = this.#stores.get(number);
        if (store === undefined) {
            if (endpoint.lifecycle.isDestructionRequested) {
                throw new StoreClosedError(`Cannot hand out a new store for ${endpoint}, which is being destroyed`);
            }
            store = new ClientEndpointStore(this, number, this.#storage.createContext(number.toString()));
            this.#stores.set(number, store);
        }

        return store;
    }

    protected override async load() {
        this.#storage = this.storageFactory.createContext("endpoints");
        this.#cacheStorage = this.storageFactory.createContext("cache");
        this.#settingsStorage = this.storageFactory.createContext("settings");

        // Legacy location of the flag: the state of the network behavior of the root endpoint
        const legacyNetwork = this.#storage.createContext("0").createContext("network");
        if (await legacyNetwork.has(DISABLED_KEY)) {
            await this.#settingsStorage.set(DISABLED_KEY, await legacyNetwork.get<boolean>(DISABLED_KEY));
            await legacyNetwork.delete(DISABLED_KEY);
        }
        this.#isDisabled = await this.#settingsStorage.get(DISABLED_KEY, false);

        for (const id of await this.#storage.contexts()) {
            const number = Number.parseInt(id) as EndpointNumber;
            if (!Number.isFinite(number)) {
                continue;
            }

            const store = new ClientEndpointStore(this, number, this.#storage.createContext(id));
            await store.load();

            // A driver may still list the context of an endpoint whose store was erased
            if (!store.loadedValues) {
                continue;
            }
            this.#stores.set(number, store);
        }

        if (await this.#cacheStorage.has(FABRIC_FILTERED_KEY)) {
            this.#cacheFabricFiltered = await this.#cacheStorage.get<boolean>(FABRIC_FILTERED_KEY);
        }
    }
}
