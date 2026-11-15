/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PeerSubscription } from "#node/server/InteractionServer.js";
import { Environment, Environmental, Logger, StorageContext, StorageManager } from "@matter/general";
import { PeerAddress, PeerAddressStore } from "@matter/protocol";

const logger = Logger.get("SubscriptionStore");

/** A subscription as stored; the storage key carries the peer address. */
type StoredSubscription = Omit<PeerSubscription, "peerAddress">;

/**
 * Subscriptions a server node recorded so it can re-establish them after a restart, stored with one key per peer.
 * Operations keep the call order of {@link PeerAddressStore}.
 */
export class SubscriptionStore {
    readonly #store: PeerAddressStore<StoredSubscription[]>;

    constructor(storage: StorageContext) {
        this.#store = new PeerAddressStore(storage);
    }

    static [Environmental.create](env: Environment) {
        const instance = new SubscriptionStore(env.get(StorageManager).createContext("subscriptions"));
        env.set(SubscriptionStore, instance);
        return instance;
    }

    /**
     * Store {@link subscriptions} as the subscriptions of {@link address}, in creation order.  An empty list deletes the
     * peer's entry.
     */
    save(address: PeerAddress, subscriptions: readonly PeerSubscription[]) {
        if (!subscriptions.length) {
            return this.#store.delete(address);
        }
        return this.#store.set(
            address,
            subscriptions.map(({ peerAddress: _peerAddress, ...subscription }) => subscription),
        );
    }

    /**
     * Read all stored subscriptions, each peer's in creation order.  A peer's entry that is not a list is deleted.
     */
    async load() {
        const stored = await this.#store.load((address, subscriptions) => {
            if (Array.isArray(subscriptions)) {
                return true;
            }
            logger.warn(`Deleting stored subscriptions of ${address}: not a list`);
            return false;
        });
        return [...stored].flatMap(([peerAddress, subscriptions]) =>
            subscriptions.map((subscription): PeerSubscription => ({ ...subscription, peerAddress })),
        );
    }

    clear() {
        return this.#store.clear();
    }
}
