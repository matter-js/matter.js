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
    RetrySchedule,
    Seconds,
    Time,
} from "#general";
import { Specification } from "#model";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import { SubscribeResponse } from "#types";
import { ClientSubscription } from "./ClientSubscription.js";
import { PeerSubscription } from "./PeerSubscription.js";

const logger = Logger.get("ClientSubscription");

/**
 * An {@link ActiveSubscription} that remains active regardless of the state of the peer.
 *
 * This class performs retries in response to connection errors and timeouts.  The underlying Matter subscription and
 * thus {@link ActiveSubscription#subscriptionId} may change if the peer goes offline or experiences transient errors.
 *
 * TODO - need to make underlying exchange provider abortable and work out how the retry schedule at this level
 *   interacts with the MDNS and secure protocol retries.  Will require some refactoring at lower levels.  Leaving
 *   retries at this level relatively conservative for now
 */
export class SustainedSubscription extends ClientSubscription {
    #request: SustainedClientSubscribe;
    #subscription?: ActiveSubscription;
    #retries: RetrySchedule;
    #subscribe: (request: Subscribe, abort: AbortSignal) => Promise<PeerSubscription>;
    #read: (request: Read, abort: AbortSignal, logContext?: ExchangeLogContext) => ReadResult;
    #active = AsyncObservableValue(false);
    #inactive = AsyncObservableValue(true);

    constructor(config: SustainedSubscription.Configuration) {
        super(config);

        const { request, read, retries, subscribe } = config;

        this.#request = request;
        this.#retries = retries;
        this.#subscribe = subscribe;
        this.#read = read;
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

        while (true) {
            // Create a request and promise that will inform us when the underlying subscription closes
            let request: SustainedClientSubscribe = { ...this.#request, updated };
            if (this.#request.updated) {
                request.updated = this.#request.updated.bind(request);
            }
            const closed = new Promise<void>(resolve => {
                request.closed = () => {
                    this.#subscription = undefined;
                    this.subscriptionId = ClientSubscription.NO_SUBSCRIPTION;
                    sessionTrusted = false;
                    resolve();
                };
            });

            if (!sessionTrusted) {
                try {
                    const response = this.#read(
                        Read({
                            fabricFilter: false,
                        }),
                        this.abort,
                        Diagnostic.asFlags({ probe: true }),
                    );
                    for await (const _chunk of response);
                } catch (e) {
                    if (!causedBy(e, AbortedError) || !this.abort.aborted) {
                        // Probing failed, so we get a new session anyway
                        sessionTrusted = true;
                        logger.error(
                            `Failed to probe reachability of peer ${this.peer}, resubscribe with new session:`,
                            Diagnostic.errorMessage(asError(e)),
                        );
                    }
                }
                if (this.abort.aborted) {
                    return;
                }
            }

            // Subscribe
            for (const retry of this.#retries) {
                try {
                    if (bootstrapWithRead) {
                        const response = this.#read(request, this.abort, Diagnostic.asFlags({ bootstrap: true }));
                        needToRefreshRequest = true; // We potentially got data, so request dataVersions are stale
                        if (request.updated) {
                            await request.updated(response);
                        } else {
                            for await (const _chunk of response);
                        }

                        if (this.abort.aborted) {
                            return;
                        }

                        bootstrapWithRead = false;
                    }
                    if (needToRefreshRequest && refreshRequest !== undefined) {
                        // Update request
                        request = refreshRequest(request);
                    }
                    needToRefreshRequest = true; // We do a subscription request now so we might have got data, even partial
                    this.#subscription = await this.#subscribe(request, this.abort);
                    this.subscriptionId = this.#subscription.subscriptionId;
                    sessionTrusted = true;
                    break;
                } catch (e) {
                    if (!causedBy(e, AbortedError) || !this.abort.aborted) {
                        // Subscription failed not by timeout but because could not be established, so we have a new session anyway
                        sessionTrusted = true;
                        logger.error(
                            `Failed to establish subscription to ${this.peer}, retry in ${Duration.format(retry)}:`,
                            Diagnostic.errorMessage(asError(e)),
                        );
                    }

                    if (this.abort.aborted) {
                        return;
                    }
                }

                const readyForRetry = Time.sleep("subscription retry", retry);
                await this.abort.race(readyForRetry);
                readyForRetry.cancel();
                if (this.abort.aborted) {
                    break;
                }
            }

            // Notify listeners of an active subscription
            await this.#inactive.emit(false);
            await this.#active.emit(true);
            if (this.abort.aborted) {
                break;
            }

            // Wait for the subscription to close
            await closed;

            // Notify listeners of an inactive subscription
            await this.#active.emit(false);
            await this.#inactive.emit(true);

            // If aborted, then we're done
            if (this.abort.aborted) {
                break;
            }

            // If we aren't aborted, then we are here due to timeout
            logger.error(`Replacing subscription to ${this.peer} due to timeout`);
        }

        // We only arrive here when closed
        this.#request.closed?.();
    }

    get interactionModelRevision() {
        return this.#subscription?.interactionModelRevision ?? Specification.INTERACTION_MODEL_REVISION;
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
         * The schedule we use for retrying subscription connections.
         *
         * We handle reconnection separately at the exchange level.  This retry schedule only applies to establishing a
         * subscription once we have an active exchange.  Exchange reconnection is handled by lower-level components.
         */
        retries: RetrySchedule;
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
