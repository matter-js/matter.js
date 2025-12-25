/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, MaybePromise, StorageContext, StorageManager } from "#general";

/**
 * Non-volatile state management for a {@link ControllerNode}.
 */
export class ControllerStore implements ControllerStoreInterface {
    #storageManager?: StorageManager;
    #sessionStorage?: StorageContext;
    #caStorage?: StorageContext; // Root certificate and Fabric
    #nodesStorage?: StorageContext; // Holds a list of nodes in the root level and then sublevels with data per client node?

    /**
     * Create a new store.
     *
     * TODO - implement conversion from 0.7 format so people can change API seamlessly
     */
    constructor(nodeId: string, storageManager: StorageManager) {
        if (nodeId === undefined) {
            throw new ImplementationError("ServerStore must be created with a nodeId");
        }

        this.#storageManager = storageManager;
    }

    async erase() {
        await this.#sessionStorage?.clearAll();
        await this.#caStorage?.clearAll();
        await this.#nodesStorage?.clearAll();
    }

    async close() {
        // nothing to do, we do not own anything
    }

    get sessionStorage() {
        if (!this.#sessionStorage) {
            this.#sessionStorage = this.storage.createContext("sessions");
        }
        return this.#sessionStorage;
    }

    get caStorage() {
        if (!this.#caStorage) {
            this.#caStorage = this.storage.createContext("credentials");
        }
        return this.#caStorage;
    }

    get nodesStorage() {
        if (this.#nodesStorage === undefined) {
            this.#nodesStorage = this.storage.createContext("nodes");
        }
        return this.#nodesStorage;
    }

    get fabricStorage() {
        return this.caStorage;
    }

    get storage() {
        if (this.#storageManager === undefined) {
            throw new ImplementationError("Node storage accessed prior to initialization");
        }
        return this.#storageManager;
    }

    async clientNodeStore(nodeId: string) {
        return this.storage.createContext(`node-${nodeId}`);
    }
}

export abstract class ControllerStoreInterface {
    abstract erase(): Promise<void>;
    abstract close(): Promise<void>;
    abstract get sessionStorage(): StorageContext;
    abstract get caStorage(): StorageContext;
    abstract get nodesStorage(): StorageContext;
    abstract get fabricStorage(): StorageContext;
    abstract clientNodeStore(nodeId: string): MaybePromise<StorageContext>;
}
