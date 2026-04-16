/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    type BlobStorageDriver,
    Construction,
    ImplementationError,
    MaybePromise,
    StorageContextFactory,
} from "@matter/general";
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

    /**
     * Obtain the BDX blob storage driver for this node.  Lazily opened on first call.
     * Override in subclasses that support blob storage.
     */
    async bdxStore(): Promise<BlobStorageDriver> {
        throw new ImplementationError("Blob storage is not available for this node store");
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
