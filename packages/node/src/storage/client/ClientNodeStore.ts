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
import type { ClientCacheBuffer } from "./ClientCacheBuffer.js";
import { ClientEndpointStore } from "./ClientEndpointStore.js";
import { LocalWriter } from "./LocalWriter.js";
import type { RemoteWriter } from "./RemoteWriter.js";

const FABRIC_FILTERED_KEY = "fabricFiltered";

/**
 * {@link ClientNode} persistence.
 */
export class ClientNodeStore extends NodeStore {
    #id: string;
    #storage?: StorageContext;
    #cacheStorage?: StorageContext;
    #cacheFabricFiltered?: boolean;
    #stores = new Map<EndpointNumber, ClientEndpointStore>();
    #write?: RemoteWriter;
    #localWriter?: LocalWriter;
    #buffer?: ClientCacheBuffer;
    #isPreexisting: boolean;
    #onErase?: () => void;

    constructor(id: string, storage: StorageContextFactory, isPreexisting: boolean, onErase?: () => void) {
        super(storage);
        this.#id = id;
        this.#isPreexisting = isPreexisting;
        this.#onErase = onErase;
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

    get localWriter() {
        if (this.#localWriter === undefined) {
            this.#localWriter = new LocalWriter(this);
        }
        return this.#localWriter;
    }

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
        if (this.#cacheStorage === undefined) {
            throw new InternalError(`Cache storage of ${this} accessed before load`);
        }
        await this.#cacheStorage.set(FABRIC_FILTERED_KEY, fabricFiltered);
        this.#cacheFabricFiltered = fabricFiltered;
    }

    get endpointStores() {
        return this.#stores.values();
    }

    storeForEndpointNumber(endpointNumber: EndpointNumber) {
        const store = this.#stores.get(endpointNumber);
        if (store === undefined) {
            throw new InternalError(`No endpoint store for endpoint ${endpointNumber}`);
        }
        return store;
    }

    override async erase() {
        const stores = [...this.#stores.values()];

        await MatterAggregateError.settleSeries(
            [
                // Cascade so caches unregister from the shared ClientCacheBuffer before storage is cleared; one that
                // stays registered flushes stale data back into the cleared context
                ...stores.map(store => () => store.erase()),

                () => {
                    this.#stores = new Map();
                    this.#onErase?.();
                    return this.#storage?.clearAll();
                },

                () => {
                    this.#cacheFabricFiltered = undefined;
                    return this.#cacheStorage?.clearAll();
                },

                () => this.construction.close(),
            ],
            `Error while erasing ${this}`,
        );
    }

    /**
     * Erase the values cached from the peer and reload what remains.  The state of behaviors that do not track a
     * remote cluster stays; see {@link ClientEndpointStore.eraseCaches}.
     */
    async eraseCaches() {
        const stores = [...this.#stores.values()];
        try {
            await MatterAggregateError.settleSeries(
                stores.map(store => () => store.eraseCaches()),
                `Error while erasing the cache of ${this}`,
            );
        } finally {
            this.#stores = new Map();
            await this.load();
        }
    }

    override storeForEndpoint(endpoint: Endpoint) {
        const { number } = endpoint;

        if (this.#storage === undefined) {
            throw new InternalError(`Endpoint storage ${this.toString()}.endpoints.${number} accessed before load`);
        }

        let store = this.#stores.get(number);
        if (store === undefined) {
            store = new ClientEndpointStore(this, number, this.#storage.createContext(number.toString()));
            this.#stores.set(number, store);
        }

        return store;
    }

    protected override async load() {
        this.#storage = this.storageFactory.createContext("endpoints");
        this.#cacheStorage = this.storageFactory.createContext("cache");
        for (const id of await this.#storage.contexts()) {
            const number = Number.parseInt(id) as EndpointNumber;
            if (!Number.isFinite(number)) {
                continue;
            }

            const store = new ClientEndpointStore(this, number, this.#storage.createContext(id));
            await store.load();
            this.#stores.set(number, store);
        }

        if (await this.#cacheStorage.has(FABRIC_FILTERED_KEY)) {
            this.#cacheFabricFiltered = await this.#cacheStorage.get<boolean>(FABRIC_FILTERED_KEY);
        }
    }
}
