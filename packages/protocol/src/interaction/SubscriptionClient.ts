/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, Environmental, Logger, MaybePromise, Time, Timer } from "#general";
import { DecodedDataReport } from "#interaction/DecodedDataReport.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { INTERACTION_PROTOCOL_ID } from "#types";
import { IncomingInteractionClientMessenger } from "./InteractionMessenger.js";

const logger = Logger.get("SubscriptionClient");

export interface RegisteredSubscription {
    id: number;
    maximumPeerResponseTimeMs: number;
    maxIntervalS: number;
    onData: (dataReport: DecodedDataReport) => MaybePromise<void>;
    onTimeout?: () => void;
}

/**
 * A simple protocol handler that handles exchanges starting with data reports.
 *
 * Incoming data reports must match to a subscription registered with {@link add} or the exchange is invalid.
 */
export class SubscriptionClient implements ProtocolHandler {
    readonly id = INTERACTION_PROTOCOL_ID;
    readonly requiresSecureSession = true;
    readonly #listeners = new Map<number, (dataReport: DecodedDataReport) => MaybePromise<void>>();
    readonly #timeouts = new Map<number, Timer>();

    constructor() {}

    static [Environmental.create](env: Environment) {
        const client = new SubscriptionClient();
        env.set(SubscriptionClient, client);
        return client;
    }

    /**
     * Register a subscription.
     */
    add(subscription: RegisteredSubscription) {
        const { id, onData, onTimeout } = subscription;

        this.#listeners.set(id, onData);
        if (onTimeout) {
            let timer = this.#timeouts.get(id);
            if (timer !== undefined) {
                timer.stop();
                this.#timeouts.delete(id);
            }

            const maxIntervalMs = subscription.maxIntervalS * 1000 + subscription.maximumPeerResponseTimeMs;

            timer = Time.getTimer("Subscription timeout", maxIntervalMs, () => {
                logger.info(`Subscription ${id} timed out after ${maxIntervalMs}ms`);
                this.delete(id);
                onTimeout();
            }).start();

            this.#timeouts.set(id, timer);
        }
    }

    /**
     * Unregister a subscription.
     */
    delete(id: number) {
        this.#listeners.delete(id);
        const timer = this.#timeouts.get(id);
        if (timer !== undefined) {
            timer.stop();
            this.#timeouts.delete(id);
        }
    }

    async onNewExchange(exchange: MessageExchange) {
        const messenger = new IncomingInteractionClientMessenger(exchange);

        let dataReport: DecodedDataReport;
        try {
            // TODO Adjust this to getting packages as callback when received to handle error cases and checks outside
            dataReport = await messenger.readAggregateDataReport(undefined, [...this.#listeners.keys()]);
        } finally {
            messenger.close().catch(error => logger.info("Error closing client messenger", error));
        }
        const subscriptionId = dataReport.subscriptionId as number; // this is checked in the messenger already because we hand over allowed list

        const listener = this.#listeners.get(subscriptionId);
        const timer = this.#timeouts.get(subscriptionId);

        if (timer !== undefined) {
            timer.stop().start(); // Restart timer because we received data
        }

        await listener?.(dataReport);
    }

    async close() {
        this.#listeners.clear();
        this.#timeouts.forEach(timer => timer.stop());
        this.#timeouts.clear();
    }
}
