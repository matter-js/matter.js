/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { type ServerNode } from "#node/ServerNode.js";
import type { StorageContext } from "@matter/general";
import { ImplementationError, InternalError, Logger } from "@matter/general";
import { ServerEndpointStore } from "./ServerEndpointStore.js";

const NEXT_NUMBER_KEY = "__nextNumber__";

const logger = Logger.get("EndpointStoreService");

/**
 * Manages {@link ServerEndpointStore}s for a {@link ServerNode} and owns the node's endpoint numbers.
 *
 * Each number is reserved for one store.  An installed endpoint keeps its number.  A reservation of an
 * endpoint that is not installed goes to another endpoint that presets the number; the original endpoint gets a new
 * number when it returns.
 */
export class ServerEndpointStores {
    #storage?: StorageContext;
    #holders = new Map<number, ServerEndpointStore>();
    #persistedNextNumber?: number;
    #numbersPersisted?: Promise<void>;
    #numbersToPersist?: Array<ServerEndpointStore>;
    #nextNumber = 1;
    #root?: ServerEndpointStore;

    async load(storage: StorageContext) {
        this.#storage = storage;

        // Load next number with excessive validation for the off-chance it somehow gets corrupted
        const nextNumber = await this.#storage.get(NEXT_NUMBER_KEY, 1);
        this.#nextNumber = Number.isInteger(nextNumber) ? nextNumber % 0xffff : 1;

        if (this.#nextNumber < 1) {
            this.#nextNumber = 1;
        } else {
            this.#persistedNextNumber = this.#nextNumber;
        }

        // Preload stores so we can access synchronously going forward
        this.#root = new ServerEndpointStore(this.#storage);
        await this.#root.load();

        // A number that storage of an older version records twice stays with the first store here; the other store
        // takes it over if it returns first
        this.#root.visit(store => {
            const number = store.number;
            if (store.path === "" || number === undefined || !isPartNumber(number)) {
                return;
            }
            if (!this.#holders.has(number)) {
                this.#holders.set(number, store);
            }
        });
    }

    async erase() {
        const storage = this.#storage;
        if (!storage) {
            return;
        }

        await this.#awaitPendingPersistence();

        this.#storage = undefined;

        await storage.clearAll();

        this.#holders = new Map();
        this.#nextNumber = 1;
        this.#persistedNextNumber = undefined;

        await this.load(storage);
    }

    async close() {
        await this.#awaitPendingPersistence();
    }

    async #awaitPendingPersistence() {
        if (this.#numbersPersisted) {
            await this.#numbersPersisted;
        }
    }

    #premature(what: string): never {
        throw new InternalError(`${what} prior to storage initialization`);
    }

    /**
     * Reserve the preset number of a {@link Endpoint} or allocate one.
     *
     * A preset number held by an endpoint that is not installed is taken over; that endpoint gets a new number when it
     * returns.  An installed holder is refused before this runs, by the node's index.  A new number is the next free one
     * after the last assigned, wrapping to 1 after 0xFFFE, and skips the preset numbers in
     * {@link AssignNumberContext.presetNumbers}.
     *
     * We must persist the assigned number and next endpoint number.  We are fairly resilient to the small chance that
     * persistence fails so we persist lazily and return synchronously.
     *
     * @see {@link MatterSpecification.v161.Core} § 9.2.10
     */
    assignNumber(endpoint: Endpoint, context: AssignNumberContext) {
        const store = this.storeForEndpoint(endpoint);

        if (endpoint.lifecycle.hasNumber) {
            this.#reserve(endpoint, store, endpoint.number, context);
            return;
        }

        const known = store.number;
        if (known !== undefined && isPartNumber(known)) {
            if (!context.isInstalled(known)) {
                this.#reserve(endpoint, store, known, context);
                endpoint.number = known;
                return;
            }
            logger.warn(`Stored number ${known} of ${endpoint} is held by another endpoint; assigning a new number`);
        }

        const number = this.#nextFreeNumber(context);
        endpoint.number = number;
        this.#claim(store, number);
    }

    #reserve(endpoint: Endpoint, store: ServerEndpointStore, number: number, context: AssignNumberContext) {
        const holder = this.#holders.get(number);
        if (holder !== undefined && holder !== store) {
            if (context.isInstalled(number)) {
                throw new InternalError(`${endpoint} claims endpoint number ${number} of an installed endpoint`);
            }
            logger.warn(
                `${endpoint} takes endpoint number ${number} from stored endpoint ${holder.path}, which gets a new number when it returns`,
            );
            holder.number = undefined;
            this.#persistNumber(holder);
        }
        this.#claim(store, number);
    }

    #claim(store: ServerEndpointStore, number: number) {
        const previous = store.number;
        if (previous !== undefined && previous !== number && this.#holders.get(previous) === store) {
            this.#holders.delete(previous);
        }

        this.#holders.set(number, store);

        let changed = false;
        if (number >= this.#nextNumber) {
            this.#nextNumber = number + 1;
            changed = true;
        }
        if (store.number !== number) {
            store.number = number;
            changed = true;
        }
        if (changed) {
            this.#persistNumber(store);
        }
    }

    #nextFreeNumber(context: AssignNumberContext) {
        const presetNumbers = context.presetNumbers();

        let candidate = this.#nextNumber;
        for (let tried = 0; tried < MAX_ENDPOINT_NUMBER; tried++, candidate++) {
            if (!isPartNumber(candidate)) {
                candidate = 1;
            }
            if (!this.#holders.has(candidate) && !presetNumbers.has(candidate)) {
                this.#nextNumber = candidate + 1;
                return candidate;
            }
        }

        throw new ImplementationError("Cannot add additional endpoints because endpoint numbers are exhausted");
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
     * The store of {@link endpoint} if it exists, without creating one.
     */
    #existingStoreFor(endpoint: Endpoint): ServerEndpointStore | undefined {
        if (endpoint.maybeNumber === 0) {
            return this.#root;
        }
        const id = endpoint.maybeId;
        if (id === undefined || endpoint.owner === undefined) {
            return undefined;
        }
        return this.#existingStoreFor(endpoint.owner)?.existingChildStore(id);
    }

    /**
     * Erase storage for a single {@link Endpoint} and release the numbers its stores hold.
     */
    async eraseStoreForEndpoint(endpoint: Endpoint) {
        if (!endpoint.owner) {
            throw new InternalError(
                "Endpoint storage inaccessible because endpoint is not a node and is not owned by another endpoint",
            );
        }

        const store = this.#existingStoreFor(endpoint);
        const ownerStore = this.#existingStoreFor(endpoint.owner);
        if (store === undefined || ownerStore === undefined) {
            return;
        }

        const released = new Array<[number, ServerEndpointStore]>();
        store.visit(erased => {
            const number = erased.number;
            if (number !== undefined && this.#holders.get(number) === erased) {
                released.push([number, erased]);
            }
        });

        await ownerStore.eraseChildStoreFor(endpoint);

        // Another endpoint may have taken a number over while the storage was erased
        for (const [number, erased] of released) {
            if (this.#holders.get(number) === erased) {
                this.#holders.delete(number);
            }
        }
    }

    /**
     * Lazily persist a newly allocated number and the next number.
     */
    #persistNumber(store: ServerEndpointStore) {
        // If there's already a set of numbers to persist there will be an outstanding promise that will do the work
        // for us
        if (this.#numbersToPersist) {
            this.#numbersToPersist.push(store);
            return;
        }

        this.#numbersToPersist = [store];

        const numberPersister = async () => {
            const numbersToPersist = this.#numbersToPersist;
            if (!numbersToPersist) {
                return;
            }

            this.#numbersToPersist = undefined;
            for (const store of numbersToPersist) {
                await store.saveNumber();
            }

            if (this.#nextNumber !== this.#persistedNextNumber) {
                if (this.#storage === undefined) {
                    this.#premature("Number persistence");
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

/**
 * What {@link ServerEndpointStores.assignNumber} needs to know about the node.
 *
 * @internal
 */
export interface AssignNumberContext {
    /**
     * Preset numbers of endpoints of the node that are not installed, which a new number must not take.  Called only
     * when a new number is allocated.
     */
    presetNumbers(): ReadonlySet<number>;

    /**
     * Does an installed endpoint of the node hold {@link number}?
     */
    isInstalled(number: number): boolean;
}

const MAX_ENDPOINT_NUMBER = 0xfffe;

function isPartNumber(number: number) {
    return Number.isInteger(number) && number >= 1 && number <= MAX_ENDPOINT_NUMBER;
}
