/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { Construction, MaybePromise, StorageContext, StorageContextFactory } from "#general";
import type { Node } from "../node/Node.js";
import { EndpointStore } from "./EndpointStore.js";

/**
 * Non-volatile state management for a {@link Node}.
 *
 * We eagerly load all available data from disk on startup.  This prevents storage from forcing asynchronous
 * {@link Endpoint} initialization.  We then can initialize most behaviors synchronously.
 */
export abstract class NodeStore {
    #storageFactory: StorageContextFactory;
    #construction: Construction<NodeStore>;
    #bdxStore?: StorageContext;

    get bdxStore(): StorageContext {
        this.construction.assert("BDX storage context");
        if (!this.#bdxStore) {
            this.#bdxStore = this.createStorageContext("bdx");
        }
        return this.#bdxStore;
    }

    get construction() {
        return this.#construction;
    }

    constructor(storageFactory: StorageContextFactory) {
        this.#storageFactory = storageFactory;
        this.#construction = Construction(this);
    }

    toString() {
        return "node store";
    }

    [Construction.construct]() {
        return this.load();
    }

    abstract storeForEndpoint(endpoint: Endpoint): EndpointStore;

    abstract erase(): MaybePromise<void>;

    protected abstract load(): MaybePromise<void>;

    protected createStorageContext(name: string) {
        return this.#storageFactory.createContext(name);
    }

    protected get storageFactory() {
        return this.#storageFactory;
    }
}
