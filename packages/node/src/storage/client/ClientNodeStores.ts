/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientGroup } from "#node/ClientGroup.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { Node } from "#node/Node.js";
import {
    Construction,
    Instant,
    MatterAggregateError,
    MemoryStorageDriver,
    StorageContext,
    StorageManager,
} from "@matter/general";
import { StoreClosedError } from "../StoreLifecycle.js";
import { ClientCacheBuffer } from "./ClientCacheBuffer.js";
import { ClientNodeStore } from "./ClientNodeStore.js";

/**
 * Prefix for incrementally assigned client IDs that are usually commissioned, so an increasing ID is used instead the
 * node id.
 */
const CLIENT_ID_PREFIX = "peer";

/**
 * Manages {@link ClientNodeStore}s for a {@link Node}.
 *
 * This collection is the only owner of the answer to "which store is the current store of node <id>".  Erasing a store
 * goes through the collection, which runs the erases of one ID one after another.  The owner rules:
 *
 * - While an erase of an ID is requested and has not ended, the collection hands out no store for that ID and opens
 *   none; {@link storeOf} returns undefined and {@link storeForNode} throws `StoreClosedError`.
 * - While {@link erase} runs, the same holds for every ID.
 * - A store that ends, or a new store that fails to load, leaves the index whether its erase or load succeeds or not.
 * - Once {@link close} was called, the collection hands out no store and refuses new erases.
 */
export class ClientNodeStores {
    #storage: StorageContext;
    #stores = new Map<string, ClientNodeStores.Entry>();
    #erasing = new Map<string, Promise<void>>();
    #resets = 0;
    #construction: Construction<ClientNodeStores>;
    #nextAutomaticId = 1;

    get construction() {
        return this.#construction;
    }

    constructor(storage: StorageContext) {
        this.#storage = storage;
        this.#construction = Construction(this);
        this.#construction.start();
    }

    async [Construction.construct]() {
        const contexts = await this.#storage.contexts();

        for (const id of contexts) {
            // Keep the auto-allocation counter ahead of any persisted "peerN" id; custom ids are restored too.
            if (id.startsWith(CLIENT_ID_PREFIX)) {
                const num = Number.parseInt(id.slice(CLIENT_ID_PREFIX.length));
                if (Number.isFinite(num) && this.#nextAutomaticId <= num) {
                    this.#nextAutomaticId = num + 1;
                }
            }

            this.#open(id, this.#storage.createContext(id), true);
        }

        await MatterAggregateError.allSettled(
            [...this.#stores.values()].map(({ store }) => store.construction.ready),
            "Error while initializing client stores",
        );
    }

    /**
     * Allocate a local ID for a peer.
     *
     * The ID may be preassigned or we will assign using an incrementing sequential number.  The number is reserved for
     * the life of this process or, if data is persisted, until erased.
     *
     * The ID is not an identity that outlives the peer.  The counter starts from the IDs already in storage, so once a
     * peer is removed and its data is gone, a peer commissioned later may receive the same ID.  Anything stored for
     * longer than the peer itself cannot rely on either identifier. A `PeerAddress` names one device only for as long as
     * that device stays commissioned. Past that it may be issued to another device under the rules
     * `ControllerBehavior.allocatePeerAddress` documents, and a lookup can then name that other device.
     */
    allocateId() {
        this.#construction.assert();

        return `${CLIENT_ID_PREFIX}${this.#nextAutomaticId++}`;
    }

    /**
     * Get the store for a single {@link ClientNode} or peer Id, and open one if there is none.
     *
     * Throws `StoreClosedError` while an erase of the ID or {@link erase} runs, as the erase may still clear the storage
     * a new store would load from.
     */
    storeForNode(nodeOrId: ClientNode | string): ClientNodeStore {
        const id = typeof nodeOrId === "string" ? nodeOrId : nodeOrId.id;
        return this.#current(id) ?? this.#open(id, this.#storage.createContext(id), false);
    }

    /**
     * Get the store for a {@link ClientGroup}, and open one if there is none.  A group store keeps its data in memory
     * only.  Its caches persist to that memory, so they do not share the buffer of the node stores.
     */
    storeForGroup(node: ClientGroup): ClientNodeStore {
        const existing = this.#current(node.id);
        if (existing !== undefined) {
            return existing;
        }

        const driver = new MemoryStorageDriver();
        const manager = new StorageManager(driver);
        manager.initialize();
        return this.#open(node.id, manager.createContext(node.id), false, new ClientCacheBuffer(driver, Instant));
    }

    /**
     * The current store of the node with {@link id}, or undefined if there is none.  Never opens a store.  There is no
     * current store while the store of the node is erased, nor once this collection closes.
     */
    storeOf(id: string): ClientNodeStore | undefined {
        if (this.#erasing.has(id) || this.#resets) {
            return;
        }
        return this.#stores.get(id)?.store;
    }

    /**
     * List all nodes present, without the nodes whose store is erased.
     */
    get knownIds() {
        this.#construction.assert();

        return [...this.#stores.keys()].filter(id => this.storeOf(id) !== undefined);
    }

    /**
     * Remove everything persisted for the node with {@link id} and end its store.
     *
     * The erase counts as requested at once: the store is no longer handed out, {@link close} and {@link erase} wait
     * for it, and another erase of the same ID waits for it too.  The store erase begins once {@link prepare} resolves,
     * whatever its outcome.  Rejects with a `MatterAggregateError` of the failures of both.  Without a current store
     * only {@link prepare} runs.
     *
     * Once {@link close} was called, {@link prepare} still runs and the call then rejects with
     * `DestroyedDependencyError`, as the storage is no longer erased.
     */
    async eraseStore(id: string, prepare?: () => Promise<void>) {
        try {
            this.#construction.assert();
        } catch (refusal) {
            await refuseAfter(prepare, refusal, `Error while erasing the store of ${id}`);
        }
        await this.#end(id, entry =>
            MatterAggregateError.settleSeries(
                [() => prepare?.(), () => entry?.store.erase()],
                `Error while erasing the store of ${id}`,
            ),
        );
    }

    /**
     * Erase the values cached from the node with {@link id} and open a new store of the node that loads what remains.
     * The new store comes from the same storage as the store it replaces, also if the erase fails.  It keeps the buffer
     * of a group store; a node store has no buffer until {@link ClientNode} initializes again and installs the buffer of
     * its server node.  A new store that fails to load leaves the index, so the next {@link storeForNode} opens another
     * one.  The erase counts as requested at once, like {@link eraseStore}.  Without a current store this does nothing.
     *
     * Rejects with a `MatterAggregateError` of the failures, or with `DestroyedDependencyError` once {@link close} was
     * called.
     */
    async eraseCaches(id: string) {
        this.#construction.assert();
        await this.#end(id, async entry => {
            if (entry === undefined) {
                return;
            }
            await MatterAggregateError.settleSeries(
                [() => entry.store.eraseCaches(), () => this.#renew(id, entry)],
                `Error while erasing the cache of node ${id}`,
            );
        });
    }

    /**
     * Discard all persisted node data.  Waits for the erases of single stores that were requested before.  Hands out
     * and opens no store until it ended.  The collection remains usable and IDs are reassigned from the start.
     */
    async erase() {
        this.#construction.assert();
        this.#resets++;
        try {
            await this.#eraseAll();
        } finally {
            this.#resets--;
        }
    }

    async #eraseAll() {
        // A store erase that ends later would clear the storage of a new node that receives the same ID
        await Promise.all(this.#erasing.values());

        const stores = [...this.#stores.values()].map(({ store }) => store);
        this.#stores.clear();

        await MatterAggregateError.settleSeries(
            [
                ...stores.map(store => () => store.erase()),

                // Data a store failed to erase must still go: the index is gone either way, so anything left behind
                // resurrects on the next lookup
                () => this.#storage.clearAll(),
                () => void (this.#nextAutomaticId = 1),
            ],
            "Error while erasing client stores",
        );
    }

    /**
     * Close all stores.  Waits for the erases of single stores that were requested before, as each still clears its
     * storage.  An erase requested once the close began is refused.
     */
    async close() {
        await this.construction.close(async () => {
            await Promise.all(this.#erasing.values());
            const stores = [...this.#stores.values()].map(({ store }) => store);
            this.#stores.clear();
            await MatterAggregateError.allSettled(
                stores.map(store => store.close()),
                "Error while closing client stores",
            );
        });
    }

    /**
     * The store of {@link id} the collection may hand out, if there is one.  Throws once the collection closed, and
     * throws `StoreClosedError` while an erase of {@link id} runs.
     */
    #current(id: string) {
        this.#construction.assert();
        if (this.#erasing.has(id)) {
            throw new StoreClosedError(`Cannot hand out the store of node ${id} because an erase of it runs`);
        }
        if (this.#resets) {
            throw new StoreClosedError(`Cannot hand out the store of node ${id} because all client stores are erased`);
        }
        return this.#stores.get(id)?.store;
    }

    async #renew(id: string, { store, storage, ownBuffer }: ClientNodeStores.Entry) {
        const renewed = this.#open(id, storage, store.isPreexisting, ownBuffer);
        try {
            await renewed.construction.ready;
        } catch (e) {
            if (this.#stores.get(id)?.store === renewed) {
                this.#stores.delete(id);
            }
            throw e;
        }
    }

    #open(id: string, storage: StorageContext, isPreexisting: boolean, ownBuffer?: ClientCacheBuffer) {
        const store = new ClientNodeStore(id, storage, isPreexisting);
        store.buffer = ownBuffer;
        store.construction.start();
        this.#stores.set(id, { store, storage, ownBuffer });
        return store;
    }

    /**
     * Run {@link work} on the current entry of {@link id} after the erases of that ID requested before.  The entry
     * leaves the index in the same synchronous step that registers the erase, or, behind an earlier erase, once that
     * ended; {@link work} begins afterwards.  The erase stays registered until the returned promise settles, so a
     * caller that resumes after it finds the store {@link work} left.
     */
    #end(id: string, work: (entry: ClientNodeStores.Entry | undefined) => Promise<void>): Promise<void> {
        const take = () => {
            const entry = this.#stores.get(id);
            this.#stores.delete(id);
            return entry;
        };
        const previous = this.#erasing.get(id);
        const taken = previous === undefined ? Promise.resolve(take()) : previous.then(take);
        const ending = taken.then(work).finally(() => {
            if (this.#erasing.get(id) === ended) {
                this.#erasing.delete(id);
            }
        });
        const ended = ending.then(
            () => {},
            () => {},
        );
        this.#erasing.set(id, ended);

        return ending;
    }
}

/**
 * Run {@link prepare}, then reject with {@link refusal}, or with both failures if {@link prepare} fails too.
 */
async function refuseAfter(
    prepare: (() => Promise<void>) | undefined,
    refusal: unknown,
    message: string,
): Promise<never> {
    try {
        await prepare?.();
    } catch (e) {
        throw new MatterAggregateError([e, refusal], message);
    }
    throw refusal;
}

export namespace ClientNodeStores {
    /**
     * A store in the index together with what a new store of the same node needs.
     */
    export interface Entry {
        store: ClientNodeStore;
        storage: StorageContext;
        ownBuffer?: ClientCacheBuffer;
    }
}
