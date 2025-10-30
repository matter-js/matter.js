/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import { Diagnostic, InternalError, Logger } from "#general";
import { DecodedDataReport } from "#interaction/DecodedDataReport.js";
import { IncomingInteractionClientMessenger } from "#interaction/InteractionMessenger.js";
import { SubscriptionId } from "#interaction/Subscription.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { SecureSession } from "#session/SecureSession.js";
import { DataReport, INTERACTION_PROTOCOL_ID, Status } from "#types";
import { InputChunk } from "../InputChunk.js";
import { ClientSubscriptions } from "./ClientSubscriptions.js";

const logger = Logger.get("ClientSubscriptionHandler");

/**
 * A protocol handler that informs {@link ClientSubscriptions} of new exchanges.
 */
export class ClientSubscriptionHandler implements ProtocolHandler {
    id = INTERACTION_PROTOCOL_ID;
    requiresSecureSession = true;

    #subscriptions: ClientSubscriptions;

    constructor(subscriptions: ClientSubscriptions) {
        this.#subscriptions = subscriptions;
    }

    async onNewExchange(exchange: MessageExchange) {
        const messenger = new IncomingInteractionClientMessenger(exchange);
        // Read the initial report
        const reports = messenger.readDataReports();

        const initialIteration = await reports.next();
        if (initialIteration.done) {
            throw new InternalError("Exchange initiated with no initial message");
        }
        const initialReport = initialIteration.value;

        // Ensure there is a subscription ID present
        const { subscriptionId } = initialReport;
        if (subscriptionId === undefined) {
            logger.debug("Ignoring unsolicited data report with no subscription ID");
            await sendInvalid(messenger, undefined);
            return;
        }

        // Ensure the subscription ID is valid
        const { session } = exchange.channel;
        SecureSession.assert(session);
        const subscription = this.#subscriptions.getPeer(session.peerAddress, subscriptionId);
        if (subscription === undefined) {
            logger.debug("Ignoring data report for unknown subscription ID", Diagnostic.strong(subscriptionId));
            await sendInvalid(messenger, subscriptionId);
            return;
        }

        // If this is just a ping, only reset the timeout
        if (!initialReport.attributeReports?.length && !initialReport.eventReports?.length) {
            subscription.timeoutAt = undefined;
            this.#subscriptions.resetTimer();
            await exchange.close();
            return;
        }

        // Pass the data to the recipient
        try {
            subscription.isReading = true;

            if (subscription.request.updated) {
                await subscription.request.updated(processReports(initialReport, reports, messenger));
            } else {
                // It doesn't make sense to have the callback undefined but we allow it in the type because they may
                // be handled by intermediate interactables.  So we handle the case here too, but just iterate and throw
                // away the reports
                for await (const _chunk of reports);
            }
        } finally {
            subscription.isReading = false;
            subscription.timeoutAt = undefined;
            this.#subscriptions.resetTimer();
            await exchange.close();
        }
    }

    async close() {}
}

async function sendInvalid(messenger: IncomingInteractionClientMessenger, subscriptionId?: SubscriptionId) {
    await messenger.sendStatus(Status.InvalidSubscription, {
        multipleMessageInteraction: true,
        logContext: {
            subId: subscriptionId,
        },
    });
    await messenger.close();
}

/**
 * Convert incoming data reports into a {@link ReadResult}.
 *
 * Parses incoming reports and validates subscription IDs.
 */
async function* processReports(
    initialReport: DataReport,
    otherReports: AsyncIterable<DataReport>,
    messenger: IncomingInteractionClientMessenger,
): ReadResult {
    yield InputChunk(initialReport);

    const { subscriptionId } = initialReport;

    for await (const report of otherReports) {
        const decoded = DecodedDataReport(report);

        if (decoded.subscriptionId === undefined) {
            logger.debug(
                "Ignoring data report for incorrect subscription id",
                Diagnostic.strong(decoded.subscriptionId),
            );
            await sendInvalid(messenger, decoded.subscriptionId);
        }

        if (decoded.subscriptionId !== subscriptionId) {
            logger.debug(
                "Ignoring data report for incorrect subscription id",
                Diagnostic.strong(decoded.subscriptionId),
            );
            await sendInvalid(messenger, decoded.subscriptionId);
            continue;
        }

        yield InputChunk(report);
    }
}
