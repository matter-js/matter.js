/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SustainedClientSubscribe } from "#action/client/subscription/ClientSubscribe.js";
import { Read } from "#action/request/Read.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { ReadResult } from "#action/response/ReadResult.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import type { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import {
    AbortedError,
    asError,
    AsyncObservableValue,
    causedBy,
    Diagnostic,
    Duration,
    Hours,
    ImplementationError,
    Logger,
    Observer,
    RetrySchedule,
    Seconds,
    Time,
} from "@matter/general";
import { SubscribeResponse } from "@matter/types";
import { ClientSubscription } from "./ClientSubscription.js";
import { PeerSubscription } from "./PeerSubscription.js";

const logger = Logger.get("ClientSubscription");

/**
 * An {@link ActiveSubscription} that remains active regardless of the state of the peer.
 *
 * This class performs retries in response to connection errors and timeouts.  The underlying Matter subscription and
 * thus {@link ActiveSubscription#subscriptionId} may change if the peer goes offline or experiences transient errors.
 *
 * When a peer is a LIT (Long Idle Time) ICD operating in await mode, the subscription instead parks on the peer's wake
 * signal (driven by Check-In messages) and (re)subscribes only when the peer becomes awake.  Wakefulness is read live
 * via the {@link SustainedSubscription.Configuration#wakefulness} provider, so a peer registered after construction or
 * flipped SIT⇄LIT at runtime is honored on the loop's next iteration.
 *
 * TODO - need to make underlying exchange provider abortable and work out how the retry schedule at this level
 *   interacts with the MDNS and secure protocol retries.  Will require some refactoring at lower levels.  Leaving
 *   retries at this level relatively conservative for now
 */
export class SustainedSubscription extends ClientSubscription {
    /** Bounded retry interval used only on the degraded path where a once-LIT peer no longer requires await. */
    static readonly SIT_RETRY_INTERVAL = Seconds(15);

    #request: SustainedClientSubscribe;
    #subscription?: ActiveSubscription;
    #retries: RetrySchedule;
    #subscribe: (request: Subscribe, abort: AbortSignal) => Promise<PeerSubscription>;
    #read: (request: Read, abort: AbortSignal, logContext?: ExchangeLogContext) => ReadResult;
    #probe: (abort: AbortSignal) => Promise<boolean>;
    #wakefulness?: () => IcdPeerWakefulness | undefined;
    #availability?: { wakefulness: IcdPeerWakefulness; observer: Observer<[boolean]> };
    #active = AsyncObservableValue(false);
    #inactive = AsyncObservableValue(true);

    constructor(config: SustainedSubscription.Configuration) {
        super(config);

        const { request, read, probe, retries, subscribe, wakefulness } = config;

        this.#request = request;
        this.#retries = retries;
        this.#subscribe = subscribe;
        this.#read = read;
        this.#probe = probe;
        this.#wakefulness = wakefulness;
        this.done = this.#run();
    }

    /**
     * Emits when the active state changes.
     */
    get active() {
        return this.#active;
    }

    /**
     * Emits when inactive state changes.
     */
    get inactive() {
        return this.#inactive;
    }

    async #run() {
        // Do we trust the session to work? Initially yes
        let sessionTrusted = true;

        const updated = this.#request.updated?.bind(this.#request);

        let { bootstrapWithRead, refreshRequest } = this.#request;
        let needToRefreshRequest = false;

        // After a failed send to an await-mode LIT peer we must wait for a fresh Check-In rather than retry within the
        // current awake window, which would hammer a peer that has likely already gone back to sleep.
        let awaitFreshSignal = false;

        try {
            while (true) {
                // Create a request and promise that will inform us when the underlying subscription closes
                let request: SustainedClientSubscribe = { ...this.#request, updated };
                if (this.#request.updated) {
                    const bound = this.#request.updated.bind(request);
                    // A report (or bootstrap-read response) is inbound peer activity, so refresh the wake/availability
                    // windows: an actively-reporting peer must read as awake for concurrent interactions.
                    request.updated = result => {
                        this.#wakefulness?.()?.noteSignal();
                        return bound(result);
                    };
                }
                const closed = new Promise<void>(resolve => {
                    request.closed = () => {
                        this.#subscription = undefined;
                        this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                        sessionTrusted = false;
                        resolve();
                    };
                });

                // For an await-mode LIT peer reachability follows the availability window, not the subscription: a
                // parked peer awaiting its next Check-In is still reachable.  Reconcile each iteration so a peer
                // registered after construction, or flipped SIT⇄LIT, attaches/detaches the observer live.
                const wakefulnessBefore = this.#wakefulness?.();
                if (wakefulnessBefore?.requiresAwait) {
                    this.#observeAvailability(wakefulnessBefore);

                    if (awaitFreshSignal) {
                        await this.#nextWake(wakefulnessBefore);
                        awaitFreshSignal = false;
                    } else if (!wakefulnessBefore.awake.value) {
                        await this.#parkUntilAwake(wakefulnessBefore);
                    }
                    if (this.abort.aborted) {
                        break;
                    }
                } else {
                    this.#unobserveAvailability();

                    if (!sessionTrusted) {
                        if (!(await this.#probe(this.abort))) {
                            if (!this.abort.aborted) {
                                // Probing failed, so we get a new session anyway
                                sessionTrusted = true;
                                logger.info(
                                    `Failed to probe reachability of peer ${this.peer}, resubscribe with new session`,
                                );
                            }
                        }
                        if (this.abort.aborted) {
                            return;
                        }
                    }
                }

                // Subscribe
                for (const retry of this.#retries) {
                    try {
                        if (needToRefreshRequest && refreshRequest !== undefined) {
                            // Update request
                            request = refreshRequest(request);
                        }
                        needToRefreshRequest = true; // We do a read or subscription request now, so we might have got data, even partial
                        if (bootstrapWithRead) {
                            const response = this.#read(request, this.abort, Diagnostic.asFlags({ bootstrap: true }));
                            if (request.updated) {
                                await request.updated(response);
                            } else {
                                for await (const _chunk of response);
                            }

                            if (this.abort.aborted) {
                                return;
                            }

                            bootstrapWithRead = false;
                            if (refreshRequest !== undefined) {
                                // Update request because read was successful
                                request = refreshRequest(request);
                            }
                        }
                        this.#subscription = await this.#subscribe(request, this.abort);
                        this.subscriptionId = this.#subscription.subscriptionId;
                        sessionTrusted = true;
                        break;
                    } catch (e) {
                        if (!causedBy(e, AbortedError) || !this.abort.aborted) {
                            // Subscription failed not by timeout but because could not be established, so we have a new session anyway
                            sessionTrusted = true;
                        }

                        if (this.abort.aborted) {
                            return;
                        }

                        // An await-mode LIT peer has no timed retry: park for the next fresh Check-In instead.
                        if (this.#wakefulness?.()?.requiresAwait) {
                            if (!causedBy(e, AbortedError)) {
                                logger.info(
                                    `Failed to establish subscription to LIT peer ${this.peer}, parking until next check-in:`,
                                    Diagnostic.errorMessage(asError(e)),
                                );
                            }
                            awaitFreshSignal = true;
                            break;
                        }

                        logger.info(
                            `Failed to establish subscription to ${this.peer}, retry in ${Duration.format(retry)}:`,
                            Diagnostic.errorMessage(asError(e)),
                        );

                        const readyForRetry = Time.sleep("subscription retry", retry);
                        await this.abort.race(readyForRetry);
                        readyForRetry.cancel();
                        if (this.abort.aborted) {
                            break;
                        }
                    }
                }

                // A LIT park-failure exits the retry loop without a subscription; loop back to await the next Check-In.
                if (awaitFreshSignal) {
                    if (this.abort.aborted) {
                        break;
                    }
                    continue;
                }

                // Notify listeners of an active subscription. In await mode the availability observer governs
                // reachability, so emitting here would be redundant (and could contradict a parked-but-offline window).
                if (this.#availability === undefined) {
                    await this.#inactive.emit(false);
                    await this.#active.emit(true);
                }
                if (this.abort.aborted) {
                    break;
                }

                await this.abort.race(closed);

                // On loss, an await-mode LIT peer's reachability is governed by the availability observer (a peer
                // still within its window stays active), so we do not emit here; everything else becomes inactive.
                if (this.#availability === undefined) {
                    await this.#active.emit(false);
                    await this.#inactive.emit(true);
                }

                // If aborted, then we're done
                if (this.abort.aborted) {
                    break;
                }

                logger.info(`Replacing subscription to ${this.peer} due to timeout`);
            }
        } finally {
            this.#unobserveAvailability();

            const subscription = this.#subscription;
            this.#subscription = undefined;
            if (subscription !== undefined) {
                this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                await subscription.close();
            }
        }
    }

    /**
     * Drive reachability ({@link active}/{@link inactive}) from an await-mode LIT peer's availability window via a
     * persistent observer, so a peer that silently drops its subscription but is still within its Check-In window
     * stays reachable, and a missed Check-In flips it inactive even while we hold a stale subscription.  Idempotent
     * for the same wakefulness; re-targets if the live provider yields a different instance.
     */
    #observeAvailability(wakefulness: IcdPeerWakefulness) {
        if (this.#availability?.wakefulness === wakefulness) {
            return;
        }
        this.#unobserveAvailability();

        const observer: Observer<[boolean]> = available => {
            this.#active.emit(available);
            this.#inactive.emit(!available);
        };
        this.#availability = { wakefulness, observer };
        this.#active.value = wakefulness.available.value;
        this.#inactive.value = !wakefulness.available.value;
        wakefulness.available.on(observer);
    }

    #unobserveAvailability() {
        if (this.#availability === undefined) {
            return;
        }
        this.#availability.wakefulness.available.off(this.#availability.observer);
        this.#availability = undefined;
    }

    /**
     * Park until the await-mode LIT peer is awake.  The persistent availability observer governs reachability while
     * parked; this only resolves the loop when the peer wakes or we abort.
     */
    async #parkUntilAwake(wakefulness: IcdPeerWakefulness) {
        await new Promise<void>(resolve => {
            const onAwake: Observer<[boolean]> = awake => {
                if (awake) {
                    cleanup();
                    resolve();
                }
            };
            const onAbort = () => {
                cleanup();
                resolve();
            };
            const cleanup = () => {
                wakefulness.awake.off(onAwake);
                this.abort.removeEventListener("abort", onAbort);
            };
            wakefulness.awake.on(onAwake);
            this.abort.addEventListener("abort", onAbort);
        });
    }

    /**
     * Resume after a failed send to an await-mode LIT peer.  Resolves on the next awake transition to true (a
     * genuinely fresh Check-In).  A peer no longer requiring await (e.g. a runtime DSLS LIT→SIT flip) has no Check-In
     * to park for, so it resumes after a bounded delay instead of stranding on an awake edge that will never re-emit.
     */
    async #nextWake(wakefulness: IcdPeerWakefulness): Promise<void> {
        if (!wakefulness.requiresAwait) {
            const retry = Time.sleep("icd sit retry", SustainedSubscription.SIT_RETRY_INTERVAL);
            try {
                await this.abort.race(retry);
            } finally {
                retry.cancel();
            }
            return;
        }

        await new Promise<void>(resolve => {
            const observer: Observer<[boolean]> = awake => {
                if (awake) {
                    cleanup();
                    resolve();
                }
            };
            const onAbort = () => {
                cleanup();
                resolve();
            };
            const cleanup = () => {
                wakefulness.awake.off(observer);
                this.abort.removeEventListener("abort", onAbort);
            };
            wakefulness.awake.on(observer);
            this.abort.addEventListener("abort", onAbort);
        });
    }

    get interactionModelRevision() {
        return this.#subscription?.interactionModelRevision;
    }

    get maxInterval() {
        return this.#subscription?.maxInterval ?? Hours.one;
    }
}

export namespace SustainedSubscription {
    /**
     * Configuration for {@link SustainedSubscription}.
     */
    export interface Configuration extends Omit<ClientSubscription.Configuration, "request"> {
        request: SustainedClientSubscribe;

        /**
         * Function to establish underlying subscription.
         */
        subscribe: (request: Subscribe, abort: AbortSignal) => Promise<PeerSubscription>;

        /**
         * Performs bootstrap read.
         */
        read: (request: Read, abort: AbortSignal) => ReadResult;

        /**
         * Probe the peer with an empty read to verify session liveness.
         */
        probe: (abort: AbortSignal) => Promise<boolean>;

        /**
         * The schedule we use for retrying subscription connections.
         *
         * We handle reconnection separately at the exchange level.  This retry schedule only applies to establishing a
         * subscription once we have an active exchange.  Exchange reconnection is handled by lower-level components.
         */
        retries: RetrySchedule;

        /**
         * Live provider of the peer's {@link IcdPeerWakefulness}.  Read on each loop decision so a peer registered after
         * construction, or flipped SIT⇄LIT at runtime, is honored on the next iteration.  When it returns a wakefulness
         * in await mode (`requiresAwait`), the subscription parks on the wake signal instead of probing/retrying;
         * otherwise behavior is identical to a non-ICD sustained subscription.
         */
        wakefulness?: () => IcdPeerWakefulness | undefined;
    }

    export function assert(subscription: SubscribeResponse): asserts subscription is SustainedSubscription {
        if (!(subscription instanceof SustainedSubscription)) {
            throw new ImplementationError(`Non-sustained subscription provided where sustained subscription required`);
        }
    }

    export const DefaultRetrySchedule: RetrySchedule.Configuration = {
        // Protocol-level level happens at the exchange level and is faster; this is an application-level retry.  Retry
        // more slowly so we do not hammer devices that are experiencing transient errors
        initialInterval: Seconds(15),

        // Similarly, we have an exchange.  If a device repeatedly fails to establish a subscription, give it plenty of
        // time to recover.  It's even possible our subscription attempt is invalid for some reason, in which case we
        // an aggressive interval would be particularly bad form
        maximumInterval: Hours(1),

        // No timeout; we run until aborted
        timeout: undefined,

        backoffFactor: 2,

        jitterFactor: 0.25,
    };
}
