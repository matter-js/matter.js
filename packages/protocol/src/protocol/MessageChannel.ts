/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec } from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import {
    Bytes,
    Channel,
    Diagnostic,
    Duration,
    IpNetworkChannel,
    isIpNetworkChannel,
    Logger,
    MaybePromise,
    ObservableValue,
    sameIpNetworkChannel,
    ServerAddressUdp,
} from "#general";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import type { Session } from "#session/Session.js";
import type { SessionParameters } from "#session/SessionParameters.js";
import { MRP } from "./MRP.js";

const logger = new Logger("MessageChannel");

export class MessageChannel implements Channel<Message> {
    #channel: Channel<Bytes>;
    #networkAddress = ObservableValue<[ServerAddressUdp]>();
    #isIpNetworkChannel = false;
    public closed = false;
    #onClose?: () => MaybePromise<void>;
    // When the session is supporting MRP and the channel is not reliable, use MRP handling

    constructor(
        channel: Channel<Bytes>,
        readonly session: Session,
        onClose?: () => MaybePromise<void>,
    ) {
        this.#channel = channel;
        if (isIpNetworkChannel(channel)) {
            this.#isIpNetworkChannel = true;
            this.#networkAddress.emit(channel.networkAddress);
        }
        this.#onClose = onClose;
    }

    set onClose(callback: () => MaybePromise<void>) {
        this.#onClose = callback;
    }

    /** Is the underlying transport reliable? */
    get isReliable() {
        return this.#channel.isReliable;
    }

    /**
     * Does the underlying transport support large messages?
     * This is only true for TCP channels currently.
     */
    get supportsLargeMessages() {
        return this.type === "tcp";
    }

    get type() {
        return this.#channel.type;
    }

    /**
     * Max Payload size of the exchange which bases on the maximum payload size of the channel. The full encoded matter
     * message payload sent here can be as huge as allowed by the channel.
     */
    get maxPayloadSize() {
        return this.#channel.maxPayloadSize;
    }

    async send(message: Message, logContext?: ExchangeLogContext) {
        logger.debug("Message", Mark.OUTBOUND, Message.diagnosticsOf(this.session, message, logContext));
        const packet = this.session.encode(message);
        const bytes = MessageCodec.encodePacket(packet);
        if (bytes.byteLength > this.maxPayloadSize) {
            logger.warn(
                `Matter message to send to ${this.name} is ${bytes.byteLength}bytes long, which is larger than the maximum allowed size of ${this.maxPayloadSize}. This only works if both nodes support it.`,
            );
        }

        return await this.#channel.send(bytes);
    }

    get name() {
        return Diagnostic.via(`${this.session.via}@${this.#channel.name}`);
    }

    get networkAddress() {
        return this.#networkAddress.value;
    }

    get networkAddressChanged() {
        return this.#networkAddress;
    }

    get channel() {
        return this.#channel;
    }

    /**
     * Sync the addresses for IP network channels and replace channel if the IPs change
     * If the channel is on a non ip network then the call is basically ignored
     * We already use a new naming here whcih will be more used in future, so yes inconsistency in naming is ok for now
     * TODO refactor this out again and remove the address from the channel
     */
    set socket(channel: Channel<Bytes>) {
        if (
            this.closed ||
            !this.#isIpNetworkChannel ||
            !isIpNetworkChannel(channel) ||
            channel.type !== "udp" ||
            this.#channel.type !== "udp"
        ) {
            return;
        }
        if (!sameIpNetworkChannel(channel, this.#channel as IpNetworkChannel<Bytes>)) {
            logger.info(`Updated channel for session`, this.name);
            this.#channel = channel;
            this.#networkAddress.emit(channel.networkAddress);
        }
    }

    async close() {
        const wasAlreadyClosed = this.closed;
        this.closed = true;
        await this.#channel.close();
        if (!wasAlreadyClosed) {
            await this.#onClose?.();
        }
    }

    calculateMaximumPeerResponseTime(
        peerSessionParameters: SessionParameters,
        localSessionParameters: SessionParameters,
        expectedProcessingTime?: Duration,
    ): Duration {
        return MRP.maxPeerResponseTimeOf({
            peerSessionParameters,
            localSessionParameters,
            channelType: this.#channel.type,
            isPeerActive: this.session.isPeerActive,
            usesMrp: this.session.usesMrp,
            expectedProcessingTime,
        });
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
        return MRP.maxRetransmissionIntervalOf({
            transmissionNumber: retransmissionCount,
            sessionParameters: sessionParameters ?? this.session.parameters,
            isPeerActive: this.session.isPeerActive,
        });
    }
}
