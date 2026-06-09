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
    Hours,
    ImplementationError,
    Logger,
    Observer,
} from "@matter/general";
import { SubscribeResponse } from "@matter/types";
import { ClientSubscription } from "./ClientSubscription.js";
import { PeerSubscription } from "./PeerSubscription.js";

const logger = Logger.get("ClientSubscription");

/**
 * A sustained {@link ActiveSubscription} for a LIT (Long Idle Time) ICD peer.
 *
 * A LIT peer is asleep most of the time, so we must not blind-send or run a timed retry against it.  Instead we park on
 * the peer's wake signal (driven by Check-In messages) and (re)subscribe only when the peer becomes awake.  Liveness is
 * the Check-In itself, so there is no proactive probe.
 *
 * Reachability ({@link active}/{@link inactive}) mirrors {@link IcdPeerWakefulness#available}, not the presence of an
 * underlying subscription: a parked-but-expected peer is still reachable; only a missed Check-In window means offline.
 */
export class IcdSustainedSubscription extends ClientSubscription {
    #request: SustainedClientSubscribe;
    #subscription?: ActiveSubscription;
    #subscribe: (request: Subscribe, abort: AbortSignal) => Promise<PeerSubscription>;
    #read?: (request: Read, abort: AbortSignal, logContext?: ExchangeLogContext) => ReadResult;
    #wakefulness: IcdPeerWakefulness;
    #active = AsyncObservableValue(false);
    #inactive = AsyncObservableValue(true);

    constructor(config: IcdSustainedSubscription.Configuration) {
        super(config);

        const { request, read, subscribe, wakefulness } = config;

        this.#request = request;
        this.#subscribe = subscribe;
        this.#read = read;
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
        // Reachability follows the peer's availability window, not the subscription: a parked LIT peer awaiting its
        // next Check-In is still reachable.
        const onAvailable: Observer<[boolean]> = available => {
            this.#active.emit(available);
            this.#inactive.emit(!available);
        };
        this.#active.value = this.#wakefulness.available.value;
        this.#inactive.value = !this.#wakefulness.available.value;
        this.#wakefulness.available.on(onAvailable);

        const updated = this.#request.updated?.bind(this.#request);
        let { bootstrapWithRead, refreshRequest } = this.#request;
        let needToRefreshRequest = false;

        // After a failed send we must wait for a fresh Check-In rather than retry within the current awake window,
        // which would hammer a peer that has likely already gone back to sleep.
        let awaitFreshSignal = false;

        try {
            while (!this.abort.aborted) {
                if (awaitFreshSignal) {
                    await this.#nextWake();
                    awaitFreshSignal = false;
                } else if (!this.#wakefulness.awake.value) {
                    // Park until the peer is awake; a Check-In re-arms the awake window.
                    await this.abort.race(this.#wakefulness.awake);
                }
                if (this.abort.aborted) {
                    break;
                }

                const request: SustainedClientSubscribe = { ...this.#request, updated };
                if (this.#request.updated) {
                    request.updated = this.#request.updated.bind(request);
                }
                const closed = new Promise<void>(resolve => {
                    request.closed = () => {
                        this.#subscription = undefined;
                        this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                        resolve();
                    };
                });

                try {
                    if (needToRefreshRequest && refreshRequest !== undefined) {
                        Object.assign(request, refreshRequest(request));
                    }
                    needToRefreshRequest = true;

                    if (bootstrapWithRead && this.#read !== undefined) {
                        const response = this.#read(request, this.abort, Diagnostic.asFlags({ bootstrap: true }));
                        if (request.updated) {
                            await request.updated(response);
                        } else {
                            for await (const _chunk of response);
                        }
                        if (this.abort.aborted) {
                            break;
                        }
                        bootstrapWithRead = false;
                        if (refreshRequest !== undefined) {
                            Object.assign(request, refreshRequest(request));
                        }
                    }

                    this.#subscription = await this.#subscribe(request, this.abort);
                    this.subscriptionId = this.#subscription.subscriptionId;
                } catch (e) {
                    if (this.abort.aborted) {
                        break;
                    }
                    if (!causedBy(e, AbortedError)) {
                        logger.info(
                            `Failed to establish subscription to LIT peer ${this.peer}, parking until next check-in:`,
                            Diagnostic.errorMessage(asError(e)),
                        );
                    }
                    awaitFreshSignal = true;
                    continue;
                }

                await this.abort.race(closed);
            }
        } finally {
            this.#wakefulness.available.off(onAvailable);

            const subscription = this.#subscription;
            this.#subscription = undefined;
            if (subscription !== undefined) {
                this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                await subscription.close();
            }
        }
    }

    /**
     * Resolve on the next awake transition to true, regardless of the current value.  Unlike awaiting the observable
     * directly (which resolves immediately when already truthy), this waits for a genuinely fresh Check-In.
     */
    #nextWake() {
        return new Promise<void>(resolve => {
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
                this.#wakefulness.awake.off(observer);
                this.abort.removeEventListener("abort", onAbort);
            };
            this.#wakefulness.awake.on(observer);
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

export namespace IcdSustainedSubscription {
    /**
     * Configuration for {@link IcdSustainedSubscription}.
     */
    export interface Configuration extends Omit<ClientSubscription.Configuration, "request"> {
        request: SustainedClientSubscribe;

        /**
         * Function to establish the underlying subscription.
         */
        subscribe: (request: Subscribe, abort: AbortSignal) => Promise<PeerSubscription>;

        /**
         * Performs the optional bootstrap read.
         */
        read?: (request: Read, abort: AbortSignal) => ReadResult;

        /**
         * Wakefulness signals for the LIT peer.  The wake signal replaces the retry schedule and liveness probe used by
         * non-ICD sustained subscriptions.
         */
        wakefulness: IcdPeerWakefulness;
    }

    export function assert(subscription: SubscribeResponse): asserts subscription is IcdSustainedSubscription {
        if (!(subscription instanceof IcdSustainedSubscription)) {
            throw new ImplementationError(
                `Non-ICD-sustained subscription provided where ICD-sustained subscription required`,
            );
        }
    }
}
