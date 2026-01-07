/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageContext } from "#general";
import { ControllerStoreInterface } from "./ControllerStore.js";

/**
 * Non-volatile state management for a {@link ControllerNode}.
 *
 * The default implementation for matter.js uses synchronous APIs for storage.
 * However, this will change in the future, and other implementations may be
 * backed by asynchronous storage.  So the public API is asynchronous.
 */
export class LegacyControllerStore implements ControllerStoreInterface {
    #rootStorage: StorageContext;
    #sessionStorage?: StorageContext;
    #caStorage?: StorageContext; // Root certificate and Fabric
    #nodesStorage?: StorageContext; // Holds list of nodes in root level and then sub levels with data per client node?

    /**
     * Create a new store.
     */
    constructor(storage: StorageContext) {
        this.#rootStorage = storage;
    }

    async erase() {
        await this.#sessionStorage?.clearAll();
        await this.#caStorage?.clearAll();
        await this.#nodesStorage?.clearAll();
    }

    async close() {
        // Nothing to do
    }

    get sessionStorage() {
        if (!this.#sessionStorage) {
            this.#sessionStorage = this.#rootStorage.createContext("SessionManager");
        }
        return this.#sessionStorage;
    }

    get caStorage() {
        if (!this.#caStorage) {
            this.#caStorage = this.#rootStorage.createContext("RootCertificateManager");
        }
        return this.#caStorage;
    }

    get nodesStorage() {
        if (this.#nodesStorage === undefined) {
            this.#nodesStorage = this.#rootStorage.createContext("MatterController"); // +fabricStore
        }
        return this.#nodesStorage;
    }

    get fabricStorage() {
        return this.nodesStorage;
    }

    clientNodeStore(nodeId: string) {
        return this.nodesStorage.createContext(`node-${nodeId}`);
    }
}
