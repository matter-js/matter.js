/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import type { StorageContext } from "#general";
import { ImplementationError, InternalError, Logger } from "#general";
import { type ServerNode } from "#node/ServerNode.js";
import { IdentityConflictError } from "#node/server/IdentityService.js";
import { ServerEndpointStore } from "./ServerEndpointStore.js";

const NEXT_NUMBER_KEY = "__nextNumber__";

const logger = Logger.get("EndpointStoreService");

/**
 * Manages {@link ServerEndpointStore}s for a {@link ServerNode}.
 */
export class ServerEndpointStores {
    #storage?: StorageContext;
    #allocatedNumbers = new Set<number>();
    #preAllocatedNumbers = new Set<number>();
    #persistedNextNumber?: number;
    #numbersPersisted?: Promise<void>;
    #numbersToPersist?: Array<Endpoint>;
    #nextNumber = 1;
    #root?: ServerEndpointStore;

    async load(storage: StorageContext) {
        this.#storage = storage;

        // Load next number with excessive validation for the off-chance it somehow gets corrupted
        this.#nextNumber = (await this.#storage.get(NEXT_NUMBER_KEY, 1)) % 0xffff;

        if (this.#nextNumber < 1) {
            this.#nextNumber = 1;
        } else {
            this.#persistedNextNumber = this.#nextNumber;
        }

        // Preload stores so we can access synchronously going forward
        this.#root = new ServerEndpointStore(this.#storage);
        await this.#root.load();

        // Ensure all known numbers are allocated.  This protects them when unknown endpoints initialize before known
        // endpoints and #nextNumber is somehow invalid
        this.#root.visit(({ number }) => {
            if (number !== undefined) {
                this.#preAllocatedNumbers.add(number);
            }
        });
    }

    async erase() {
        const storage = this.#storage;
        if (!storage) {
            return;
        }

        if (this.#numbersPersisted) {
            await this.#numbersPersisted;
        }

        this.#storage = undefined;

        await storage.clearAll();

        this.#allocatedNumbers = new Set();
        this.#nextNumber = 1;
        this.#persistedNextNumber = undefined;

        await this.load(storage);
    }

    async close() {
        // We can't dispose until number persistence completes
        if (this.#numbersPersisted) {
            await this.#numbersPersisted;
        }
    }

    #premature(what: string): never {
        throw new InternalError(`${what} prior to storage initialization`);
    }

    /**
     * Allocate an endpoint number.
     *
     * Either allocates a new number for a {@link Endpoint} or reserves the endpoint's number.  If the {@link Endpoint}
     * already has a number but it is allocated to a different endpoint it is an error.
     *
     * We must persist the assigned number and next endpoint number.  We are fairly resilient to the small chance that
     * persistence fails so we persist lazily and return synchronously.
     */
    assignNumber(endpoint: Endpoint) {
        const store = this.storeForEndpoint(endpoint);

        if (endpoint.lifecycle.hasNumber) {
            // Reserve number
            if (this.#allocatedNumbers.has(endpoint.number)) {
                if (this.storeForEndpoint(endpoint).number !== endpoint.number) {
                    throw new IdentityConflictError(
                        `Endpoint ${endpoint.id} number ${endpoint.number} is allocated to another endpoint`,
                    );
                }
                return;
            }
        } else {
            // Allocate number
            const knownNumber = store.number;
            if (knownNumber) {
                if (this.#allocatedNumbers.has(knownNumber)) {
                    logger.warn(`Stored number ${knownNumber} is already allocated to another endpoint, ignoring`);
                } else {
                    this.#preAllocatedNumbers.delete(knownNumber);
                    this.#allocatedNumbers.add(knownNumber);
                    endpoint.number = knownNumber;
                    return;
                }
            }

            const startNumber = this.#nextNumber;

            while (
                this.#nextNumber < 1 ||
                this.#allocatedNumbers.has(this.#nextNumber) ||
                this.#preAllocatedNumbers.has(this.#nextNumber)
            ) {
                this.#nextNumber = (this.#nextNumber + 1) % 0xffff;
                if (this.#nextNumber === startNumber) {
                    throw new ImplementationError(
                        "Cannot add additional endpoints because endpoint numbers are exhausted",
                    );
                }
            }

            const number = this.#nextNumber++;
            endpoint.number = number;
        }

        this.#allocatedNumbers.add(endpoint.number);
        store.number = endpoint.number;
        this.#persistNumber(endpoint);
    }

    /**
     * Obtain the store for a single {@link Endpoint}.
     *
     * These stores are cached internally by ID.
     */
    storeForEndpoint(endpoint: Endpoint): ServerEndpointStore {
        if (endpoint.maybeNumber === 0) {
            if (this.#root === undefined) {
                this.#premature("Root store accessed");
            }
            return this.#root;
        }

        if (!endpoint.owner) {
            throw new InternalError(
                "Endpoint storage inaccessible because endpoint is not a node and is not owned by another endpoint",
            );
        }

        return this.storeForEndpoint(endpoint.owner).childStoreFor(endpoint);
    }

    /**
     * Deactivate the store for a single {@link Endpoint}. This puts the endpoint number back into pre-allocated state
     */
    deactivateStoreForEndpoint(endpoint: Endpoint) {
        if (endpoint.maybeNumber === 0) {
            throw new InternalError("Cannot deactivate root node store");
        }

        if (!this.#allocatedNumbers.has(endpoint.number)) {
            return;
        }
        this.#allocatedNumbers.delete(endpoint.number);
        this.#preAllocatedNumbers.add(endpoint.number);
    }

    /**
     * Erase storage for a single {@link Endpoint}.
     */
    async eraseStoreForEndpoint(endpoint: Endpoint) {
        if (!endpoint.owner) {
            throw new InternalError(
                "Endpoint storage inaccessible because endpoint is not a node and is not owned by another endpoint",
            );
        }

        await this.storeForEndpoint(endpoint.owner).eraseChildStoreFor(endpoint);

        this.#allocatedNumbers.delete(endpoint.number);
        this.#preAllocatedNumbers.delete(endpoint.number);
    }

    /**
     * Lazily persist a newly allocated number and the next number.
     */
    #persistNumber(endpoint: Endpoint) {
        // If there's already a set of numbers to persist there will be an outstanding promise that will do the work
        // for us
        if (this.#numbersToPersist) {
            this.#numbersToPersist.push(endpoint);
            return;
        }

        this.#numbersToPersist = [endpoint];

        const numberPersister = async () => {
            const numbersToPersist = this.#numbersToPersist;
            if (!numbersToPersist) {
                return;
            }

            this.#numbersToPersist = undefined;
            for (const endpoint of numbersToPersist) {
                const store = this.storeForEndpoint(endpoint);
                await store.saveNumber();
            }

            if (this.#nextNumber !== this.#persistedNextNumber) {
                if (this.#storage === undefined) {
                    this.#premature("Numer persistance");
                }
                await this.#storage.set(NEXT_NUMBER_KEY, this.#nextNumber);
                this.#persistedNextNumber = this.#nextNumber;
            }
        };

        // There is a very small chance that there is an outstanding worker that is persisting numbers but hasn't yet
        // completed.  If this is the case then wait our turn.  Otherwise there's an even smaller chance that
        // this.#nextNumber gets persisted in the wrong order
        if (this.#numbersPersisted) {
            this.#numbersPersisted = this.#numbersPersisted.then(numberPersister);
        } else {
            this.#numbersPersisted = numberPersister();
        }
    }
}
