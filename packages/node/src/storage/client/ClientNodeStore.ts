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

/**
 * {@link ClientNode} persistence.
 */
export class ClientNodeStore extends NodeStore {
    #id: string;
    #storage?: StorageContext;
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
        // Cascade so caches unregister from the shared ClientCacheBuffer before storage is cleared.  Every endpoint is
        // visited even if one fails; a cache left registered flushes stale data back into the cleared context
        const errors = new Array<unknown>();
        for (const store of this.#stores.values()) {
            try {
                await store.erase();
            } catch (error) {
                errors.push(error);
            }
        }

        this.#stores = new Map();
        this.#onErase?.();

        try {
            await this.#storage?.clearAll();
        } catch (error) {
            errors.push(error);
        }

        await this.construction.close();

        if (errors.length) {
            throw new MatterAggregateError(errors, `Error while erasing ${this}`);
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
        for (const id of await this.#storage.contexts()) {
            const number = Number.parseInt(id) as EndpointNumber;
            if (!Number.isFinite(number)) {
                continue;
            }

            const store = new ClientEndpointStore(this, number, this.#storage.createContext(id));
            await store.load();
            this.#stores.set(number, store);
        }
    }
}
