/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subscribe } from "#action/request/Subscribe.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import {
    asError,
    AsyncObservableValue,
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
import { SubscribeResponse } from "#types";
import type { ClientSubscribe } from "./ClientSubscribe.js";
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
    #request: ClientSubscribe;
    #subscription?: ActiveSubscription;
    #retries: RetrySchedule;
    #subscribe: (request: Subscribe) => Promise<PeerSubscription>;
    #active = AsyncObservableValue(false);
    #inactive = AsyncObservableValue(true);

    constructor(config: SustainedSubscription.Configuration) {
        super(config);

        const { request, retries, subscribe } = config;

        this.#request = request;
        this.#retries = retries;
        this.#subscribe = subscribe;
        this.done = this.#run();
    }

    /**
     * Emits when active state changes.
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
        const updated = this.#request.updated?.bind(this.#request);

        while (true) {
            // Create request and promise that will inform us when the underlying subscription closes
            const request = { ...this.#request, updated };
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

            // Subscribe
            for (const retry of this.#retries) {
                try {
                    this.#subscription = await this.#subscribe(request);
                    this.subscriptionId = this.#subscription.subscriptionId;
                    break;
                } catch (e) {
                    if (this.abort.aborted) {
                        return;
                    }

                    logger.error(
                        `Failed to establish subscription to ${this.peer}, retry in ${Duration.format(retry)}:`,
                        Diagnostic.errorMessage(asError(e)),
                    );
                }

                const readyForRetry = Time.sleep("subscription retry", retry);
                await this.abort.race(readyForRetry);
                readyForRetry.cancel();
                if (this.abort.aborted) {
                    break;
                }
            }

            // Notify listeners of active subscription
            await this.#inactive.emit(false);
            await this.#active.emit(true);
            if (this.abort.aborted) {
                break;
            }

            // Wait for the subscription to close
            await closed;

            // Notify listeners of inactive subscription
            await this.#active.emit(false);
            await this.#inactive.emit(true);
            if (this.abort.aborted) {
                break;
            }

            // If aborted then we're done
            if (this.abort.aborted) {
                break;
            }

            // If we aren't aborted then we are here due to timeout
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
    export interface Configuration extends ClientSubscription.Configuration {
        /**
         * Function to establish underlying subscription.
         */
        subscribe: (request: Subscribe) => Promise<PeerSubscription>;

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
