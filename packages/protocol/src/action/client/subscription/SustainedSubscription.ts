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
    Observable,
    Observer,
    RetrySchedule,
    Seconds,
    Time,
} from "@matter/general";
import { type NodeId, SubscribeResponse } from "@matter/types";
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
 * via the {@link SustainedSubscription.Configuration#wakefulness} provider, so a peer registered after construction is
 * honored on the loop's next iteration.  A runtime SIT⇄LIT operating-mode flip recreates the subscription so its
 * intervals are renegotiated for the new mode.
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
    #peerFed?: () => Observable<[NodeId]> | undefined;
    #active = AsyncObservableValue(false);
    #inactive = AsyncObservableValue(true);

    constructor(config: SustainedSubscription.Configuration) {
        super(config);

        const { request, read, probe, retries, subscribe, wakefulness, peerFed } = config;

        this.#request = request;
        this.#retries = retries;
        this.#subscribe = subscribe;
        this.#read = read;
        this.#probe = probe;
        this.#wakefulness = wakefulness;
        this.#peerFed = peerFed;
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

        // A mode-flip recreate is time-critical: it must land inside the peer's brief active window. Carry a one-shot
        // flag so the recreate's subscribe bypasses the per-network throttle rather than queuing behind it.
        let recreateWithPriorityNetwork = false;
        const priorityNetwork = "icdLit";

        try {
            while (true) {
                // Create a request and promise that will inform us when the underlying subscription closes
                let request: SustainedClientSubscribe = { ...this.#request, updated };
                if (recreateWithPriorityNetwork) {
                    request.network = priorityNetwork;
                    recreateWithPriorityNetwork = false;
                } else if (request.network === undefined && this.#wakefulness?.()?.requiresAwait) {
                    // Live each iteration, not captured at subscribe, so a peer that became LIT at runtime is
                    // prioritized on its next park-resume too, not only on the mode-flip recreate above.
                    request.network = priorityNetwork;
                }
                if (this.#request.updated) {
                    const bound = this.#request.updated.bind(request);
                    // A data report (or bootstrap-read response) is inbound peer activity, so refresh the
                    // wake/availability windows: an actively-reporting peer must read as awake for concurrent
                    // interactions.
                    request.updated = result => {
                        this.#wakefulness?.()?.noteSignal();
                        return bound(result);
                    };
                }
                // An empty keepalive report carries no data and so never reaches updated(); re-arm wakefulness from it
                // too so a subscribed LIT peer's heartbeat keeps it reachable between data changes. Chain the caller's
                // handler rather than replace it.
                if (this.#wakefulness !== undefined) {
                    const bound = this.#request.keepaliveReceived?.bind(request);
                    request.keepaliveReceived = () => {
                        this.#wakefulness?.()?.noteSignal();
                        return bound?.();
                    };
                }
                const closed = new Promise<void>(resolve => {
                    request.closed = () => {
                        this.#subscription = undefined;
                        this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                        this.#wakefulness?.()?.setActiveReportInterval(undefined);
                        sessionTrusted = false;
                        resolve();
                    };
                });

                // Reconcile each iteration so a peer registered after construction, or flipped SIT⇄LIT, is honored
                // live.
                const wakefulnessBefore = this.#wakefulness?.();
                if (wakefulnessBefore?.requiresAwait) {
                    // Gate on active: on the initial park (active already false) this await must be skipped, else the
                    // added microtask would let a synchronous wake signal race ahead of the observer registration below.
                    if (awaitFreshSignal) {
                        if (this.#active.value) {
                            await this.#reportNotLive();
                        }
                        await this.#nextWake(wakefulnessBefore);
                        awaitFreshSignal = false;
                    } else if (!wakefulnessBefore.awake.value) {
                        if (this.#active.value) {
                            await this.#reportNotLive();
                        }
                        // Re-check after the #reportNotLive await: a wake that landed during it is the edge we would
                        // park for, and #awaitAwake's observer only fires on the *next* emit, so skip the park.
                        if (!wakefulnessBefore.awake.value) {
                            await this.#awaitAwake(wakefulnessBefore);
                        }
                    }
                    if (this.abort.aborted) {
                        break;
                    }
                } else {
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
                        // Size the peer's availability window from the negotiated report cadence: while subscribed the
                        // peer suppresses Check-Ins and re-arms availability via reports that arrive as late as
                        // maxInterval (idle + jitter), which exceeds the idle-based window.
                        this.#wakefulness?.()?.setActiveReportInterval(Seconds(this.#subscription.maxInterval));
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

                        // A mode-flip recreate whose subscribe failed is about to park/retry with no subscription held.
                        if (this.#active.value) {
                            await this.#reportNotLive();
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

                await this.#inactive.emit(false);
                await this.#active.emit(true);
                if (this.abort.aborted) {
                    break;
                }

                const modeFlipped = await this.#awaitClosedOrModeFlip(closed);

                if (!modeFlipped) {
                    // Genuine loss: report not-live so consumers re-establish.  A deliberate mode-flip recreate keeps
                    // active until it either re-establishes (no-op, no churn) or has to park/retry (reported there).
                    await this.#reportNotLive();
                }

                // If aborted, then we're done
                if (this.abort.aborted) {
                    break;
                }

                if (modeFlipped) {
                    const subscription = this.#subscription;
                    this.#subscription = undefined;
                    this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                    this.#wakefulness?.()?.setActiveReportInterval(undefined);
                    // We tear this down deliberately; the CASE session is untouched, so keep it trusted and
                    // re-subscribe without a probe. Detach the closed callback so its async fire cannot route this
                    // deliberate close back through the loss handler and flip sessionTrusted.
                    request.closed = undefined;
                    sessionTrusted = true;
                    if (subscription !== undefined) {
                        await subscription.close();
                    }
                    logger.info(`Recreating subscription to ${this.peer} after ICD operating mode change`);
                    recreateWithPriorityNetwork = true;
                    continue;
                }

                logger.info(`Replacing subscription to ${this.peer} after loss`);
            }
        } finally {
            const subscription = this.#subscription;
            this.#subscription = undefined;
            if (subscription !== undefined) {
                this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                this.#wakefulness?.()?.setActiveReportInterval(undefined);
                await subscription.close();
            }
        }
    }

    /** Report that we no longer hold an established subscription.  Callers gate this on {@link active} being set. */
    async #reportNotLive() {
        await this.#active.emit(false);
        await this.#inactive.emit(true);
    }

    /**
     * Wait until the active subscription closes or the peer flips operating mode (SIT⇄LIT) at runtime, whichever
     * comes first, or until we abort.  Returns true only when a mode flip won the race, signalling the caller to
     * recreate the subscription for the new mode.
     */
    async #awaitClosedOrModeFlip(closed: Promise<void>): Promise<boolean> {
        const wakefulness = this.#wakefulness?.();
        if (wakefulness === undefined) {
            // No wakefulness yet: the subscription established before its peer was fed. Race the feed signal so the
            // first registration-induced flip is not missed until a later loss.
            const peerFed = this.#peerFed?.();
            if (peerFed === undefined) {
                await this.abort.race(closed);
                return false;
            }

            let fed = false;
            let observer: Observer<[NodeId]> | undefined;
            const feed = new Promise<void>(resolve => {
                observer = nodeId => {
                    if (nodeId === this.peer.nodeId) {
                        fed = true;
                        resolve();
                    }
                };
                peerFed.on(observer);
            });
            try {
                await this.abort.race(Promise.race([closed, feed]));
            } finally {
                if (observer !== undefined) {
                    peerFed.off(observer);
                }
            }
            return fed && !this.abort.aborted;
        }

        let flipped = false;
        let observer: Observer<[boolean]> | undefined;
        const flip = new Promise<void>(resolve => {
            observer = () => {
                flipped = true;
                resolve();
            };
            wakefulness.operatingModeChanged.on(observer);
        });
        try {
            await this.abort.race(Promise.race([closed, flip]));
        } finally {
            if (observer !== undefined) {
                wakefulness.operatingModeChanged.off(observer);
            }
        }
        return flipped && !this.abort.aborted;
    }

    /**
     * Resolve on the peer's next awake transition to true (a genuinely fresh Check-In), or when the subscription
     * aborts.  Uses {@link Abort.race} so an already-aborted signal resolves immediately rather than stranding on an
     * awake edge that may never come (the peer is asleep).
     */
    async #awaitAwake(wakefulness: IcdPeerWakefulness): Promise<void> {
        let observer: Observer<[boolean]> | undefined;
        const awake = new Promise<void>(resolve => {
            observer = value => {
                if (value) {
                    resolve();
                }
            };
            wakefulness.awake.on(observer);
        });
        try {
            await this.abort.race(awake);
        } finally {
            if (observer) {
                wakefulness.awake.off(observer);
            }
        }
    }

    /**
     * Resume after a failed send to an await-mode LIT peer by parking for the next Check-In.  A peer no longer
     * requiring await (e.g. a runtime DSLS LIT→SIT flip) has no Check-In to park for, so it resumes after a bounded
     * delay instead of stranding on an awake edge that will never re-emit.
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

        await this.#awaitAwake(wakefulness);
    }

    get interactionModelRevision() {
        return this.#subscription?.interactionModelRevision;
    }

    get maxInterval() {
        return this.#subscription?.maxInterval ?? Seconds.of(Hours.one);
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

        /**
         * Live provider of the fabric ICD registry's "peer fed" signal, emitting the peer node ID whenever a peer is
         * registered (fed).  A subscription established before its peer was fed holds no wakefulness to observe a mode
         * flip on, so it races this signal: the first registration-induced feed re-iterates the run loop, which
         * re-captures the now-present wakefulness and recreates through the normal mode-flip path.
         */
        peerFed?: () => Observable<[NodeId]> | undefined;
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
