/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#MatterError.js";
import { MaybePromise } from "#util/Promises.js";
import { Environment } from "../environment/Environment.js";
import type { DataNamespace } from "./DataNamespace.js";
import { MemoryBlobStorageDriver } from "./MemoryBlobStorageDriver.js";
import { MemoryStorageDriver } from "./MemoryStorageDriver.js";
import { StorageDriver } from "./StorageDriver.js";
import { StorageManager } from "./StorageManager.js";
import { StorageService } from "./StorageService.js";

/**
 * A {@link StorageService} subclass for tests and non-filesystem environments.
 *
 * Overrides {@link open} to call a user-supplied opener function.  The opener defaults to
 * `() => new MemoryStorageDriver()`, so `new MockStorageService(env)` gives you a pure in-memory storage service with
 * no further setup.
 */
export class MockStorageService extends StorageService {
    #opener?: (namespace: string) => MaybePromise<StorageDriver>;
    #stores = new Map<string, MemoryStorageDriver>();

    constructor(environment: Environment, opener?: (namespace: string) => MaybePromise<StorageDriver>) {
        super(environment);
        this.#opener = opener;

        // Register MemoryBlobStorageDriver so openBlobStorage works in tests
        this.registerBlobDriver({
            id: MemoryBlobStorageDriver.id,
            create: () => new MemoryBlobStorageDriver(),
        });
        this.defaultBlobDriver = MemoryBlobStorageDriver.id;
    }

    /**
     * Get or create the in-memory store for a namespace.
     *
     * Only available when using the default (no custom opener) mode.  Useful for tests that need to pre-populate or
     * inspect storage directly.
     */
    store(namespace: string) {
        if (this.#opener !== undefined) {
            throw new InternalError("store() is only available without a custom opener");
        }
        let store = this.#stores.get(namespace);
        if (!store) {
            store = MemoryStorageDriver.create();
            this.#stores.set(namespace, store);
        }
        return store;
    }

    override get isConfigured(): boolean {
        return true;
    }

    override async open(namespace: string | DataNamespace) {
        const name = typeof namespace === "string" ? namespace : namespace.namespace;
        let storage: StorageDriver;
        if (this.#opener !== undefined) {
            storage = await this.#opener(name);
        } else {
            storage = this.store(name);
        }
        const manager = new StorageManager(storage);
        await manager.initialize();
        return manager;
    }
}
