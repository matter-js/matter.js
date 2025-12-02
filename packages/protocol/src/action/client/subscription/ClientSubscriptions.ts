/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import { BasicSet, Environment, Environmental, Lifetime, Millis, Time, Timer, Timestamp } from "#general";
import { SubscriptionId } from "#interaction/Subscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ClientSubscription } from "./ClientSubscription.js";
import type { PeerSubscription } from "./PeerSubscription.js";

/**
 * A managed set of {@link ActiveSubscription} instances.
 */
export class ClientSubscriptions implements Lifetime.Owner {
    #lifetime: Lifetime;
    #active = new BasicSet<ClientSubscription>();
    #peers = new Map<PeerAddress, Map<number, PeerSubscription>>();
    #timeout?: Timer;

    constructor(lifetime: Lifetime.Owner) {
        this.#lifetime = lifetime.join("client subscriptions");
    }

    static [Environmental.create](env: Environment) {
        const instance = new ClientSubscriptions(env);
        env.set(ClientSubscriptions, instance);
        return instance;
    }

    join(...name: unknown[]) {
        return this.#lifetime.join(...name);
    }

    /**
     * Register a user-facing {@link ClientSubscription}.
     */
    addActive(subscription: ClientSubscription) {
        this.#active.add(subscription);
    }

    /**
     * Register a {@link PeerSubscription}.
     */
    addPeer(subscription: PeerSubscription) {
        let forPeer = this.#peers.get(subscription.peer);
        if (forPeer === undefined) {
            this.#peers.set(subscription.peer, (forPeer = new Map()));
        }
        forPeer.set(subscription.subscriptionId, subscription);

        this.resetTimer();
    }

    /**
     * Retrieve a {@link PeerSubscription} by ID.
     */
    getPeer(address: PeerAddress, id: SubscriptionId) {
        return this.#peers.get(address)?.get(id);
    }

    /**
     * Unregister a {@link PeerSubscription}.
     */
    delete(subscription: ClientSubscription) {
        const forPeer = this.#peers.get(subscription.peer);
        if (forPeer?.delete(subscription.subscriptionId)) {
            if (!forPeer.size) {
                this.#peers.delete(subscription.peer);
            }
        }
        this.#active.delete(subscription);
    }

    /**
     * Iterate over active subscriptions.
     */
    [Symbol.iterator]() {
        return this.#active[Symbol.iterator]();
    }

    /**
     * Terminate all subscriptions.
     */
    async close() {
        using _closing = this.#lifetime.closing();

        if (this.#timeout) {
            this.#timeout.stop();
            this.#timeout = undefined;
        }

        for (const subscription of this.#active) {
            subscription.close();
        }

        await this.#active.empty;
    }

    /**
     * Restart the timeout timer for the current set of active subscriptions.
     */
    resetTimer() {
        const now = Time.nowMs;
        let nextTimeoutAt: Timestamp | undefined;

        // Process each subscription
        for (const peer of this.#peers.values()) {
            for (const subscription of peer.values()) {
                // If reading data reports, ignore for timeout purposes
                if (subscription.isReading) {
                    continue;
                }

                // Update timeout or expire if timed out
                let { timeoutAt } = subscription;
                if (timeoutAt === undefined) {
                    // Set timeout time
                    timeoutAt = subscription.timeoutAt = Timestamp(now + subscription.timeout);
                } else if (timeoutAt < now) {
                    // Timeout
                    subscription.timedOut();
                    continue;
                }

                // If this is the earliest timeout, record
                if (nextTimeoutAt === undefined || nextTimeoutAt > timeoutAt) {
                    nextTimeoutAt = timeoutAt;
                }
            }
        }

        // If no subscriptions require timeout, disable timer
        if (nextTimeoutAt === undefined) {
            this.#timeout?.stop();
            return;
        }

        // Create or update timer if not set for correct interval
        if (this.#timeout) {
            this.#timeout?.stop();
            this.#timeout.interval = Millis(nextTimeoutAt - now);
        } else {
            this.#timeout = Time.getTimer(
                "Subscription timeout",
                Millis(nextTimeoutAt - now),
                this.resetTimer.bind(this),
            );
        }
        this.#timeout.start();
    }
}

export namespace ClientSubscriptions {
    export interface Listener {
        (reports: AsyncIterable<ReadResult.Chunk>): Promise<void>;
    }
}
