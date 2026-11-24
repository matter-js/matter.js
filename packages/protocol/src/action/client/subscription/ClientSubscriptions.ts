/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subscribe } from "#action/request/Subscribe.js";
import { ReadResult } from "#action/response/ReadResult.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import { SubscriptionId } from "#interaction/Subscription.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import type { SecureSession } from "#session/SecureSession.js";
import {
    BasicSet,
    createPromise,
    Environment,
    Environmental,
    InternalError,
    Lifetime,
    Logger,
    Millis,
    Observable,
    Time,
    Timer,
    Timestamp,
} from "@matter/general";
import { ClientSubscription } from "./ClientSubscription.js";
import type { PeerSubscription } from "./PeerSubscription.js";

const logger = Logger.get("ClientSubscriptions");

/**
 * A managed set of {@link ActiveSubscription} instances.
 */
export class ClientSubscriptions implements Lifetime.Owner {
    #lifetime: Lifetime;
    #active = new BasicSet<ClientSubscription>();
    #peers = new PeerAddressMap<Map<number, PeerSubscription>>();
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
     * Emits when a report the peer pushes starts arriving on one of its subscriptions, with the session it arrived
     * over.  A priming report returned inline in the subscribe exchange does not emit.
     * Observers must be synchronous; returned promises are not awaited.
     */
    readonly reportStarted = Observable<[session: SecureSession]>(error =>
        logger.warn("Unhandled error in reportStarted observer:", error),
    );

    /**
     * Observes pushed subscription reports without changing their handling. Priming reports do not emit.
     *
     * Kind      | When
     * ----------|---------------------------------------------------------------------
     * message   | Each received ReportData with the initial subscription ID
     * value     | Each decoded attribute or event value consumed by the update callback
     *
     * An unknown initial ID emits a message with no subscription before InvalidSubscription is sent.
     * Missing IDs and later chunks with another ID do not emit.
     *
     * Message observations have `isInitial` set only for the first message of each
     * exchange. Count exchanges from that flag, without waiting for a final chunk that may never arrive.
     * The message's `empty` flag means that message has no attribute or event report
     * entries, including status entries. An empty later chunk does not make the whole exchange empty.
     * An empty initial message also invokes {@link Subscribe.keepaliveReceived} for a known subscription.
     *
     * Observers must be synchronous; returned promises are not awaited. Observers run on the receive path,
     * must not modify the subscription or value, and must return promptly.
     * Observer errors are logged and do not interrupt report handling. Values are borrowed
     * from the update stream; observing does not cause data to be decoded or consumed.
     * Observers are released when this registry closes.
     * Exchanges with no observers at their initial message use the unwrapped receive stream. Adding an
     * observer during such an exchange starts observation with the next exchange.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.5.1, Subscribe Interaction
     */
    readonly reportReceived = Observable<[report: ClientSubscriptions.Report]>(error =>
        logger.debug("Unhandled error in reportReceived observer:", error),
    );

    /**
     * Close all {@link PeerSubscription}s for a specific peer, triggering re-subscription.
     */
    closeForPeer(address: PeerAddress) {
        const forPeer = this.#peers.get(address);
        if (forPeer) {
            for (const subscription of [...forPeer.values()]) {
                subscription.close();
            }
            this.resetTimer();
        }
    }

    /**
     * Unregister a subscription.  Stops the timeout timer once no {@link PeerSubscription} remains.
     */
    delete(subscription: ClientSubscription) {
        const forPeer = this.#peers.get(subscription.peer);
        if (forPeer?.delete(subscription.subscriptionId)) {
            if (!forPeer.size) {
                this.#peers.delete(subscription.peer);
            }
        }
        this.#active.delete(subscription);
        if (!this.#peers.size) {
            this.#timeout?.stop();
        }
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

        try {
            await this.#active.empty;
        } finally {
            this.reportStarted[Symbol.dispose]();
            this.reportReceived[Symbol.dispose]();
        }
    }

    /**
     * Restart the timeout timer for the current set of active subscriptions.
     */
    resetTimer() {
        if (this.#blocked) {
            this.#timeout?.stop();
            return;
        }

        const now = Time.nowUs;
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
                } else if (timeoutAt <= now) {
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
    /**
     * A received message or a consumed value from a pushed subscription report.
     *
     * The session is the authenticated transport session, not a claim that the subscription remains active.
     *
     * @see {@link ClientSubscriptions.reportReceived}
     * @see {@link MatterSpecification.v161.Core} § 8.5.1
     */
    export type Report =
        | {
              readonly kind: "message";
              readonly session: SecureSession;
              readonly subscriptionId: SubscriptionId;
              readonly subscription: PeerSubscription | undefined;
              readonly isInitial: boolean;
              readonly empty: boolean;
              readonly moreChunkedMessages: boolean;
          }
        | {
              readonly kind: "value";
              readonly session: SecureSession;
              readonly subscription: PeerSubscription;
              readonly report: Readonly<ReadResult.AttributeValue | ReadResult.EventValue>;
          };

    export interface Listener {
        (reports: AsyncIterable<ReadResult.Chunk>): Promise<void>;
    }
}
