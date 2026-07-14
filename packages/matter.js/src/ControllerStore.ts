/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, MaybePromise, StorageContext, StorageManager } from "@matter/general";

/**
 * Non-volatile state management for a {@link ControllerNode}.
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
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
     *
     * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
     */
    constructor(nodeId: string, storageManager: StorageManager) {
        if (nodeId === undefined) {
            throw new ImplementationError("ServerStore must be created with a nodeId");
        }

        this.#storageManager = storageManager;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async erase() {
        await this.#sessionStorage?.clearAll();
        await this.#caStorage?.clearAll();
        await this.#nodesStorage?.clearAll();
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async close() {
        // nothing to do, we do not own anything
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get sessionStorage() {
        if (!this.#sessionStorage) {
            this.#sessionStorage = this.storage.createContext("sessions");
        }
        return this.#sessionStorage;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get caStorage() {
        if (!this.#caStorage) {
            this.#caStorage = this.storage.createContext("credentials");
        }
        return this.#caStorage;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get nodesStorage() {
        if (this.#nodesStorage === undefined) {
            this.#nodesStorage = this.storage.createContext("nodes");
        }
        return this.#nodesStorage;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get fabricStorage() {
        return this.caStorage;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get storage() {
        if (this.#storageManager === undefined) {
            throw new ImplementationError("Node storage accessed prior to initialization");
        }
        return this.#storageManager;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async clientNodeStore(nodeId: string) {
        return this.storage.createContext(`node-${nodeId}`);
    }
}

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export abstract class ControllerStoreInterface {
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract erase(): Promise<void>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract close(): Promise<void>;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract get sessionStorage(): StorageContext;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract get caStorage(): StorageContext;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract get nodesStorage(): StorageContext;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract get fabricStorage(): StorageContext;
    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    abstract clientNodeStore(nodeId: string): MaybePromise<StorageContext>;
}
