/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec } from "#codec/MessageCodec.js";
import {
    Bytes,
    Channel,
    Diagnostic,
    Duration,
    IpNetworkChannel,
    Logger,
    MatterFlowError,
    MaybePromise,
    Millis,
    Seconds,
} from "#general";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import type { Session } from "#session/Session.js";
import type { SessionParameters } from "#session/SessionParameters.js";

const logger = new Logger("MessageChannel");

/**
 * Default expected processing time for a messages in milliseconds. The value is derived from kExpectedIMProcessingTime
 * from chip implementation. This is basically the default used with different names, also kExpectedLowProcessingTime or
 * kExpectedSigma1ProcessingTime.
 */
export const DEFAULT_EXPECTED_PROCESSING_TIME = Seconds(2);

/**
 * The buffer time in milliseconds to add to the peer response time to also consider network delays and other factors.
 * TODO: This is a pure guess and should be adjusted in the future.
 */
const PEER_RESPONSE_TIME_BUFFER = Seconds(5);

export namespace MRP {
    /**
     * The maximum number of transmission attempts for a given reliable message. The sender MAY choose this value as it
     * sees fit.
     */
    export const MAX_TRANSMISSIONS = 5;

    /** The base number for the exponential backoff equation. */
    export const BACKOFF_BASE = 1.6;

    /** The scaler for random jitter in the backoff equation. */
    export const BACKOFF_JITTER = 0.25;

    /** The scaler margin increase to backoff over the peer sleepy interval. */
    export const BACKOFF_MARGIN = 1.1;

    /** The number of retransmissions before transitioning from linear to exponential backoff. */
    export const BACKOFF_THRESHOLD = 1;

    /** @see {@link MatterSpecification.v12.Core}, section 4.11.8 */
    export const STANDALONE_ACK_TIMEOUT = Millis(200);
}

export class MessageChannel implements Channel<Message> {
    public closed = false;
    #onClose?: () => MaybePromise<void>;
    // When the session is supporting MRP and the channel is not reliable, use MRP handling

    constructor(
        readonly channel: Channel<Bytes>,
        readonly session: Session,
        onClose?: () => MaybePromise<void>,
    ) {
        this.#onClose = onClose;
    }

    set onClose(callback: () => MaybePromise<void>) {
        this.#onClose = callback;
    }

    /** Is the underlying transport reliable? */
    get isReliable() {
        return this.channel.isReliable;
    }

    /**
     * Does the underlying transport support large messages?
     * This is only true for TCP channels currently.
     */
    get supportsLargeMessages() {
        return this.type === "tcp";
    }

    get type() {
        return this.channel.type;
    }

    /**
     * Max Payload size of the exchange which bases on the maximum payload size of the channel. The full encoded matter
     * message payload sent here can be as huge as allowed by the channel.
     */
    get maxPayloadSize() {
        return this.channel.maxPayloadSize;
    }

    async send(message: Message, logContext?: ExchangeLogContext) {
        logger.debug("Message »", Message.diagnosticsOf(this.session, message, logContext));
        const packet = this.session.encode(message);
        const bytes = MessageCodec.encodePacket(packet);
        if (bytes.byteLength > this.maxPayloadSize) {
            logger.warn(
                `Matter message to send to ${this.name} is ${bytes.byteLength}bytes long, which is larger than the maximum allowed size of ${this.maxPayloadSize}. This only works if both nodes support it.`,
            );
        }

        return await this.channel.send(bytes);
    }

    get name() {
        return Diagnostic.via(`${this.session.via}@${this.channel.name}`);
    }

    get networkAddress() {
        return (this.channel as IpNetworkChannel<Bytes> | undefined)?.networkAddress;
    }

    async close() {
        const wasAlreadyClosed = this.closed;
        this.closed = true;
        await this.channel.close();
        if (!wasAlreadyClosed) {
            await this.#onClose?.();
        }
    }

    calculateMaximumPeerResponseTime(
        peerSessionParameters: SessionParameters,
        localSessionParameters: SessionParameters,
        expectedProcessingTime = DEFAULT_EXPECTED_PROCESSING_TIME,
    ): Duration {
        switch (this.channel.type) {
            case "tcp":
                // TCP uses 30s timeout according to chip sdk implementation, so do the same
                return Millis(Seconds(30) + PEER_RESPONSE_TIME_BUFFER);

            case "udp":
                // UDP normally uses MRP, if not we have Group communication, which normally have no responses
                if (!this.session.usesMrp) {
                    throw new MatterFlowError("No response expected for this message exchange because UDP and no MRP.");
                }
                // Calculate the maximum time till the peer got our last retry and worst case for the way back
                return Millis(
                    this.#calculateMrpMaximumPeerResponseTime(peerSessionParameters) +
                        this.#calculateMrpMaximumPeerResponseTime(localSessionParameters) +
                        expectedProcessingTime +
                        PEER_RESPONSE_TIME_BUFFER,
                );

            case "ble":
                // chip sdk uses BTP_ACK_TIMEOUT_MS which is wrong in my eyes, so we use static 30s as like TCP here
                return Millis(Seconds(30) + PEER_RESPONSE_TIME_BUFFER);

            default:
                throw new MatterFlowError(
                    `Can not calculate expected timeout for unknown channel type: ${this.channel.type}`,
                );
        }
    }

    /**
     * Calculates the backoff time for a resubmission based on the current retransmission count.
     * If no session parameters are provided, the parameters of the current session are used.
     * If session parameters are provided, the method can be used to calculate the maximum backoff time for the other
     * side of the exchange.
     *
     * @see {@link MatterSpecification.v10.Core}, section 4.11.2.1
     */
    getMrpResubmissionBackOffTime(retransmissionCount: number, sessionParameters?: SessionParameters) {
        const { activeInterval, idleInterval } = sessionParameters ?? this.session.parameters;
        // For the first message of a new exchange ... SHALL be set according to the idle state of the peer node.
        // For all subsequent messages of the exchange, ... SHOULD be set according to the active state of the peer node
        const peerActive = retransmissionCount > 0 && (sessionParameters !== undefined || this.session.isPeerActive);
        const baseInterval = peerActive ? activeInterval : idleInterval;
        return Millis.floor(
            Millis(
                baseInterval *
                    MRP.BACKOFF_MARGIN *
                    Math.pow(MRP.BACKOFF_BASE, Math.max(0, retransmissionCount - MRP.BACKOFF_THRESHOLD)) *
                    (1 + (sessionParameters !== undefined ? 1 : Math.random()) * MRP.BACKOFF_JITTER),
            ),
        );
    }

    /** Calculates the maximum time the peer might take to respond when using MRP for one direction. */
    #calculateMrpMaximumPeerResponseTime(sessionParameters: SessionParameters) {
        let finalWaitTime = 0;

        // and then add the time the other side needs for a full resubmission cycle under the assumption we are active
        for (let i = 0; i < MRP.MAX_TRANSMISSIONS; i++) {
            finalWaitTime = Millis(finalWaitTime + this.getMrpResubmissionBackOffTime(i, sessionParameters));
        }

        return finalWaitTime;
    }
}
