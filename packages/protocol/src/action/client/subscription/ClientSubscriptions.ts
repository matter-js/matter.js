/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import { SubscriptionId } from "#interaction/Subscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import {
    BasicSet,
    createPromise,
    Environment,
    Environmental,
    InternalError,
    Lifetime,
    Millis,
    Time,
    Timer,
    Timestamp,
} from "@matter/general";
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
    #blocked = false;
    #inFlightCount = 0;
    #inFlightDrained?: { promise: Promise<void>; resolver: () => void };
    #readingAbort = new AbortController();

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
     * Whether new data report processing is blocked.
     */
    get isBlocked() {
        return this.#blocked;
    }

    /**
     * Abort signal that fires when {@link blockNewActivity} is called.  Pass to exchange read operations so in-flight
     * data report reads terminate promptly instead of waiting for the full report to complete.
     */
    get readingAbortSignal(): AbortSignal {
        return this.#readingAbort.signal;
    }

    /**
     * Block new data report processing, abort in-flight reads, and await their completion.
     *
     * The block flag and abort signal fire synchronously so callers in sync contexts (e.g. abort handlers) take
     * immediate effect.  The returned promise resolves once every in-flight read has finished.
     */
    async blockNewActivity() {
        if (this.#blocked) {
            // A concurrent caller (e.g. close() after the abort handler) must still wait for the drain
            if (this.#inFlightDrained) {
                await this.#inFlightDrained.promise;
            }
            return;
        }
        this.#blocked = true;
        this.#readingAbort.abort();

        if (this.#inFlightCount > 0) {
            const { promise, resolver } = createPromise<void>();
            this.#inFlightDrained = { promise, resolver };
            await promise;
        }
    }

    /**
     * Track an in-flight data report read.  Must be called synchronously before the first await in the handler so
     * there is no gap between the {@link isBlocked} check and the tracking.  Use with `using` to guarantee cleanup:
     *
     * ```ts
     * using _reading = subscriptions.beginReading();
     * await handleExchange(exchange);
     * ```
     */
    beginReading(): Disposable {
        this.#inFlightCount++;

        return {
            [Symbol.dispose]: () => {
                if (this.#inFlightCount <= 0) {
                    throw new InternalError("reading disposed without matching beginReading");
                }

                this.#inFlightCount--;

                if (this.#inFlightCount === 0 && this.#inFlightDrained) {
                    this.#inFlightDrained.resolver();
                    this.#inFlightDrained = undefined;
                }
            },
        };
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
     * Terminate all subscriptions.  Also blocks and drains in-flight data report reads so that no new data is
     * processed after this method returns.
     */
    async close() {
        using _closing = this.#lifetime.closing();

        // Block new reads, abort in-flight ones, and wait for them to finish before tearing down subscriptions.
        // This is also called from the runtime abort handler; the idempotency guard in blockNewActivity prevents
        // double-execution regardless of which path runs first.
        await this.blockNewActivity();

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
        if (this.#blocked) {
            this.#timeout?.stop();
            return;
        }

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
