/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, PacketHeader, SessionType } from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import {
    AsyncObservableValue,
    Bytes,
    createPromise,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    DataReadQueue,
    Diagnostic,
    Duration,
    hex,
    Instant,
    InternalError,
    Lifetime,
    Logger,
    MatterFlowError,
    Millis,
    Time,
    Timer,
} from "#general";
import { GroupSession } from "#session/GroupSession.js";
import type { NodeSession } from "#session/NodeSession.js";
import { Session } from "#session/Session.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    GroupId,
    NodeId,
    SECURE_CHANNEL_PROTOCOL_ID,
    SecureMessageType,
    StatusCode,
    StatusResponseError,
} from "#types";
import { RetransmissionLimitReachedError, SessionClosedError, UnexpectedMessageError } from "./errors.js";
import { DEFAULT_EXPECTED_PROCESSING_TIME, MRP } from "./MessageChannel.js";

const logger = Logger.get("MessageExchange");

export type ExchangeLogContext = Record<string, unknown>;

export type ExchangeSendOptions = {
    /**
     * The response to this send should be an ack only and no StatusResponse or such. If a StatusResponse is returned
     * then this is handled as error.
     */
    expectAckOnly?: boolean;

    /**
     * If the message is part of a multiple message interaction, this flag indicates that it is not allowed
     * to establish a new exchange
     */
    multipleMessageInteraction?: boolean;

    /**
     * Defined an expected processing time by the responder for the message. This is used to calculate the final
     * timeout for responses together with the normal retransmission logic when MRP is used.
     */
    expectedProcessingTime?: Duration;

    /** Allows to specify if the send message requires to be acknowledged by the receiver or not. */
    requiresAck?: boolean;

    /** Use the provided acknowledge MessageId instead checking the latest to send one */
    includeAcknowledgeMessageId?: number;

    /**
     * Disables the MRP logic which means that no retransmissions are done and receiving an ack is not awaited.
     */
    disableMrpLogic?: boolean;

    /** Additional context information for logging to be included at the beginning of the Message log. */
    logContext?: ExchangeLogContext;

    // TODO Restructure exchange logic to not be protocol bound like now. The Protocol binding should move to the
    //  messages itself
    /** Allows to override the protocol ID of the message, mainly used for standalone acks. */
    protocolId?: number;
};

/**
 * Message size overhead of a Matter message:
 * 26 (Matter Message Header) + 12 (Matter Payload Header) taken from https://github.com/project-chip/connectedhomeip/blob/2d97cda23024e72f36216900ca667bf1a0d9499f/src/system/SystemConfig.h#L327
 * 16 byte MIC is then also needed to be excluded from the max payload size
 * Secure Extensions and Message Extensions need to be handled by exchange additionally!
 */
export const MATTER_MESSAGE_OVERHEAD = 26 + 12 + CRYPTO_AEAD_MIC_LENGTH_BYTES;

/**
 * Interfaces {@link MessageExchange} with other components.
 */
export interface MessageExchangeContext {
    session: Session;
    retry(number: number): void;
    localSessionParameters: SessionParameters;
}

/**
 * A Matter "message exchange" is a sequence of messages associated with a single interaction.
 *
 * TODO - rewrite using sleeps and abort controller
 */
export class MessageExchange {
    static fromInitialMessage(context: MessageExchangeContext, initialMessage: Message) {
        const { session } = context;
        return new MessageExchange({
            context,
            isInitiator: false,
            peerSessionId: session.id,
            nodeId: initialMessage.packetHeader.destNodeId,
            peerNodeId: initialMessage.packetHeader.sourceNodeId,
            exchangeId: initialMessage.payloadHeader.exchangeId,
            protocolId: initialMessage.payloadHeader.protocolId,
        });
    }

    static initiate(context: MessageExchangeContext, exchangeId: number, protocolId: number) {
        const { session } = context;
        return new MessageExchange({
            context,
            isInitiator: true,
            peerSessionId: session.peerSessionId,
            nodeId: session.nodeId,
            peerNodeId: session.peerNodeId,
            exchangeId,
            protocolId,
        });
    }

    readonly #context: MessageExchangeContext;
    readonly #isInitiator: boolean;
    readonly #messagesQueue = new DataReadQueue<Message>();
    readonly #lifetime: Lifetime;
    #receivedMessageToAck: Message | undefined;
    #receivedMessageAckTimer = Time.getTimer("ack receipt timeout", MRP.STANDALONE_ACK_TIMEOUT, () => {
        if (this.#receivedMessageToAck !== undefined) {
            const messageToAck = this.#receivedMessageToAck;
            this.#receivedMessageToAck = undefined;
            // TODO await
            this.#sendStandaloneAckForMessage(messageToAck).catch(error =>
                logger.error("An error happened when sending a standalone ack", error),
            );
        }
    });
    #sentMessageToAck: Message | undefined;
    #sentMessageAckSuccess: ((message: Message | undefined) => void) | undefined;
    #sentMessageAckFailure: ((error?: Error) => void) | undefined;
    #retransmissionTimer: Timer | undefined;
    #retransmissionCounter = 0;
    #closeTimer: Timer | undefined;
    #isDestroyed = false;
    #timedInteractionTimer: Timer | undefined;
    #used: boolean;

    readonly #peerSessionId: number;
    readonly #nodeId: NodeId | undefined;
    readonly #peerNodeId: NodeId | undefined;
    readonly #exchangeId: number;
    readonly #protocolId: number;
    readonly #closed = AsyncObservableValue();
    readonly #closing = AsyncObservableValue();

    constructor(config: MessageExchange.Config) {
        const { context, isInitiator, peerSessionId, nodeId, peerNodeId, exchangeId, protocolId } = config;

        this.#context = context;
        this.#isInitiator = isInitiator;
        this.#peerSessionId = peerSessionId;
        this.#nodeId = nodeId;
        this.#peerNodeId = peerNodeId;
        this.#exchangeId = exchangeId;
        this.#protocolId = protocolId;

        const { activeThreshold, activeInterval, idleInterval } = this.session.parameters;

        this.#used = !isInitiator; // If we are the initiator then exchange was not used yet, so track it

        const { session } = context;
        logger.debug(
            "New exchange",
            isInitiator ? Mark.OUTBOUND : Mark.INBOUND,
            this.via,
            Diagnostic.dict({
                protocol: this.#protocolId,
                peerSess: Session.idStrOf(this.#peerSessionId),
                SAT: activeThreshold !== undefined ? Duration.format(activeThreshold) : undefined,
                SAI: activeInterval !== undefined ? Duration.format(activeInterval) : undefined,
                SII: idleInterval !== undefined ? Duration.format(idleInterval) : undefined,
                maxTrans: MRP.MAX_TRANSMISSIONS,
                exchangeFlags: Diagnostic.asFlags({
                    MRP: this.session.usesMrp,
                    I: this.isInitiator,
                }),
            }),
        );

        session.addExchange(this);

        // Only do partial via because other details are in parent lifetime
        this.#lifetime = this.#context.session.join("exchange", Diagnostic.via(hex.word(this.id)));
    }

    get context() {
        return this.#context;
    }

    get isInitiator() {
        return this.#isInitiator;
    }

    /** Emits when the exchange is actually closed. This happens after all Retries and Communication are done. */
    get closed() {
        return this.#closed;
    }

    get considerClosed() {
        return this.#closed.value || (this.#isInitiator && this.#closing.value);
    }

    /**
     * Emit when the exchange is closing, but not yet closed. We only wait for acks and retries to happen, but the
     * actual interaction logic is already done.
     */
    get closing() {
        return this.#closing;
    }

    get id() {
        return this.#exchangeId;
    }

    get idStr() {
        return hex.word(this.#exchangeId);
    }

    get session() {
        return this.context.session;
    }

    get channel() {
        return this.session.channel;
    }

    /**
     * Max Payload size of the exchange which bases on the maximum payload size of the channel reduced by Matter
     * protocol overhead.
     */
    get maxPayloadSize() {
        // TODO: Whenever we add support for MessageExtensions or Secured Message extensions then these need to be also
        //  considered here and their size needs to be subtracted from the maxPayloadSize of the channel.
        return this.channel.maxPayloadSize - MATTER_MESSAGE_OVERHEAD;
    }

    join(...name: unknown[]) {
        return this.#lifetime.join(...name);
    }

    async onMessageReceived(message: Message, duplicate = false) {
        logger.debug("Message", Mark.INBOUND, Message.diagnosticsOf(this, message, { duplicate }));

        // Adjust the incoming message when ack was required, but this exchange does not use it to skip all relevant logic
        if (message.payloadHeader.requiresAck && !this.session.usesMrp) {
            logger.debug("Ignoring ack-required flag because MRP is not used for this exchange");
            message.payloadHeader.requiresAck = false;
        }

        const {
            packetHeader: { messageId },
            payloadHeader: { requiresAck, ackedMessageId, protocolId, messageType },
        } = message;

        const isStandaloneAck = SecureMessageType.isStandaloneAck(protocolId, messageType);
        if (protocolId !== this.#protocolId && !isStandaloneAck) {
            throw new MatterFlowError(
                `Drop received a message for an unexpected protocol. Expected: ${this.#protocolId}, received: ${protocolId}`,
            );
        }

        this.session.notifyActivity(true);

        if (duplicate) {
            // Received a message retransmission, but the reply is not ready yet, ignoring
            if (requiresAck) {
                await this.#sendStandaloneAckForMessage(message);
            }
            return;
        }
        if (messageId === this.#sentMessageToAck?.payloadHeader.ackedMessageId) {
            // Received a message retransmission. This means that the other side didn't get our ack
            // Resending the previous reply message which contains the ack
            using _acking = this.join("resending ack");
            await this.channel.send(this.#sentMessageToAck);
            return;
        }
        const sentMessageIdToAck = this.#sentMessageToAck?.packetHeader.messageId;
        if (sentMessageIdToAck !== undefined) {
            if (ackedMessageId === undefined) {
                // The message has no ack, but one previous message sent still needs to be acked.
                throw new MatterFlowError("Previous message ack is missing");
            } else if (ackedMessageId !== sentMessageIdToAck) {
                // The message has an ack for another message.
                if (isStandaloneAck) {
                    // Ignore if this is a standalone ack, probably this was a retransmission.
                } else {
                    throw new MatterFlowError(
                        `Incorrect ack received. Expected ${sentMessageIdToAck}, received: ${ackedMessageId}`,
                    );
                }
            } else {
                // The other side has received our previous message
                this.#retransmissionTimer?.stop();
                this.#retransmissionCounter = 0;
                this.#sentMessageAckSuccess?.(message);
                this.#sentMessageAckSuccess = undefined;
                this.#sentMessageAckFailure = undefined;
                this.#sentMessageToAck = undefined;
                if (isStandaloneAck && this.#closeTimer !== undefined) {
                    // All resubmissions done and in closing, no need to wait further
                    return this.#close();
                }
            }
        }
        if (isStandaloneAck) {
            // Don't include standalone acks in the message stream
            return;
        }
        if (requiresAck) {
            // We still have a message to ack, so ack this one as standalone ack directly
            if (this.#receivedMessageToAck !== undefined) {
                this.#receivedMessageAckTimer.stop();
                await this.#sendStandaloneAckForMessage(this.#receivedMessageToAck);
                return;
            }
            this.#receivedMessageToAck = message;
            this.#receivedMessageAckTimer.start();
        }
        this.#messagesQueue.write(message);
    }

    async send(messageType: number, payload: Bytes, options: ExchangeSendOptions = {}) {
        const {
            expectAckOnly = false,
            disableMrpLogic,
            expectedProcessingTime = DEFAULT_EXPECTED_PROCESSING_TIME,
            includeAcknowledgeMessageId,
            logContext,
            protocolId = this.#protocolId,
        } = options;

        if (!this.session.usesMrp && includeAcknowledgeMessageId !== undefined) {
            throw new InternalError("Cannot include an acknowledge message ID when MRP is not used");
        }

        let { requiresAck } = options;
        if (requiresAck && !(this.session.usesMrp || (this.session as NodeSession).isPeerLost)) {
            requiresAck = false;
        }

        const isStandaloneAck = SecureMessageType.isStandaloneAck(protocolId, messageType);
        if (isStandaloneAck) {
            if (!this.session.usesMrp) {
                return;
            }
            if (requiresAck) {
                throw new MatterFlowError("A standalone ack may not require acknowledgement.");
            }
        }
        if (this.#sentMessageToAck !== undefined && !isStandaloneAck) {
            throw new MatterFlowError("The previous message has not been acked yet, cannot send a new message.");
        }

        this.#used = true;
        this.session.notifyActivity(false);

        let ackedMessageId = includeAcknowledgeMessageId;
        if (ackedMessageId === undefined && this.session.usesMrp) {
            ackedMessageId = this.#receivedMessageToAck?.packetHeader.messageId;
            if (ackedMessageId !== undefined) {
                this.#receivedMessageAckTimer.stop();
                this.#receivedMessageToAck = undefined;
            }
        }

        let packetHeader: PacketHeader;
        if (this.session.type === SessionType.Unicast) {
            packetHeader = {
                sessionId: this.#peerSessionId,
                sessionType: SessionType.Unicast,
                messageId: await this.session.getIncrementedMessageCounter(),
                destNodeId: this.#peerNodeId,
                sourceNodeId: this.#nodeId,
                hasPrivacyEnhancements: false,
                isControlMessage: false,
                hasMessageExtensions: false,
            };
        } else if (this.session.type === SessionType.Group) {
            const session = this.session;
            if (!GroupSession.is(session)) {
                throw new InternalError("Session is not a GroupSession, but session type is Group.");
            }
            const destGroupId = GroupId.fromNodeId(this.#peerNodeId!); // TODO !!! Where get from?
            if (destGroupId === 0) {
                throw new InternalError(`Invalid GroupId extracted from NodeId ${this.#peerNodeId}`);
            }
            packetHeader = {
                sessionId: this.#peerSessionId,
                sessionType: SessionType.Group,
                messageId: await session.getIncrementedMessageCounter(),
                destGroupId,
                sourceNodeId: this.#nodeId, // We are the source node, so use our NodeId
                hasPrivacyEnhancements: false,
                isControlMessage: false,
                hasMessageExtensions: false,
            };
        } else {
            throw new InternalError(`Unknown session type: ${this.session.type}`);
        }

        const message: Message = {
            packetHeader,
            payloadHeader: {
                exchangeId: this.#exchangeId,
                protocolId,
                messageType,
                isInitiatorMessage: this.isInitiator,
                requiresAck: requiresAck ?? (this.session.usesMrp && !isStandaloneAck),
                ackedMessageId,
                hasSecuredExtension: false,
            },
            payload,
        };

        let ackPromise: Promise<Message | undefined> | undefined;
        if (this.session.usesMrp && message.payloadHeader.requiresAck && !disableMrpLogic) {
            this.#sentMessageToAck = message;
            this.#retransmissionTimer = Time.getTimer(
                `retransmitting ${Message.via(this, message)}`,
                this.channel.getMrpResubmissionBackOffTime(0),
                () => this.#retransmitMessage(message, expectedProcessingTime),
            );
            const { promise, resolver, rejecter } = createPromise<Message | undefined>();
            ackPromise = promise;
            this.#sentMessageAckSuccess = resolver;
            this.#sentMessageAckFailure = rejecter;
        }

        using sending = this.join("sending", Diagnostic.strong(Message.via(this, message)));
        await this.channel.send(message, logContext);

        if (ackPromise !== undefined) {
            this.#retransmissionCounter = 0;
            this.#retransmissionTimer?.start();

            // Await response.  Resolves with message when received, undefined when aborted, and rejects on timeout
            using _waiting = sending.join("waiting for ack");
            const responseMessage = await ackPromise;

            this.#sentMessageAckSuccess = undefined;
            this.#sentMessageAckFailure = undefined;

            if (responseMessage) {
                // If we only expect an Ack without data but got data, throw an error
                const {
                    payloadHeader: { protocolId, messageType },
                } = responseMessage;
                if (expectAckOnly && !SecureMessageType.isStandaloneAck(protocolId, messageType)) {
                    throw new UnexpectedMessageError("Expected ack only", this.session, responseMessage);
                }
            }
        }
    }

    nextMessage(options?: { expectedProcessingTime?: Duration; timeout?: Duration }) {
        let timeout: Duration;
        if (options?.timeout !== undefined) {
            timeout = options.timeout;
        } else if (this.#messagesQueue.size > 0) {
            timeout = Instant; // If we have messages in the queue, we can return them immediately
        } else {
            timeout = this.channel.calculateMaximumPeerResponseTime(
                this.session.parameters,
                this.context.localSessionParameters,
                options?.expectedProcessingTime,
            );
        }
        return this.#messagesQueue.read(timeout);
    }

    async #sendStandaloneAckForMessage(message: Message) {
        const {
            packetHeader: { messageId },
            payloadHeader: { requiresAck },
        } = message;
        if (!requiresAck || !this.session.usesMrp) return;

        await this.send(SecureMessageType.StandaloneAck, new Uint8Array(0), {
            includeAcknowledgeMessageId: messageId,
            protocolId: SECURE_CHANNEL_PROTOCOL_ID,
        });
    }

    #retransmitMessage(message: Message, expectedProcessingTime?: Duration) {
        this.#retransmissionCounter++;
        if (this.considerClosed || this.#retransmissionCounter >= MRP.MAX_TRANSMISSIONS) {
            // Ok all 4 resubmissions are done, but we need to wait a bit longer because of processing time and
            // the resubmissions from the other side
            if (expectedProcessingTime && !this.considerClosed) {
                // We already have waited after the last message was sent, so deduct this time from the final wait time
                const finalWaitTime = Millis(
                    this.channel.calculateMaximumPeerResponseTime(
                        this.session.parameters,
                        this.context.localSessionParameters,
                        expectedProcessingTime,
                    ) - (this.#retransmissionTimer?.interval ?? Instant),
                );
                if (finalWaitTime > 0) {
                    this.#retransmissionCounter--; // We will not resubmit the message again
                    logger.debug(
                        `Message ${Message.via(this, message)}: Wait additional ${Duration.format(finalWaitTime)} for processing time and peer resubmissions after all our resubmissions`,
                    );
                    this.#retransmissionTimer = Time.getTimer(
                        `waiting after resubmissions for ${Message.via(this, message)}`,
                        finalWaitTime,
                        () => this.#retransmitMessage(message),
                    ).start();
                    return;
                }
            }

            // All resubmissions done and no expected processing time, close directly
            if (this.#sentMessageToAck !== undefined && this.#sentMessageAckFailure !== undefined) {
                this.#receivedMessageToAck = undefined;
                this.#sentMessageAckFailure(new RetransmissionLimitReachedError());
                this.#sentMessageAckFailure = undefined;
                this.#sentMessageAckSuccess = undefined;
            }
            if (this.#closeTimer !== undefined) {
                // All resubmissions done and in closing, no need to wait further
                // TODO await
                this.#close().catch(error => logger.error("Error closing exchange", error));
            }
            return;
        }

        this.session.notifyActivity(false);

        this.context.retry(this.#retransmissionCounter);
        const resubmissionBackoffTime = this.channel.getMrpResubmissionBackOffTime(this.#retransmissionCounter);
        logger.debug(
            `Resubmitting ${Message.via(this, message)} (retransmission attempt ${this.#retransmissionCounter}, backoff time ${Duration.format(resubmissionBackoffTime)}))`,
        );

        // TODO await
        this.channel
            .send(message)
            .then(() => this.#initializeResubmission(message, resubmissionBackoffTime, expectedProcessingTime))
            .catch(error => {
                logger.error(`Error retransmitting ${Message.via(this, message)}:`, error);
                if (error instanceof SessionClosedError) {
                    this.#close().catch(error => logger.error("An error happened when closing the exchange", error));
                } else {
                    this.#initializeResubmission(message, resubmissionBackoffTime, expectedProcessingTime);
                }
            });
    }

    #initializeResubmission(message: Message, resubmissionBackoffTime: Duration, expectedProcessingTimeMs?: Duration) {
        this.#retransmissionTimer = Time.getTimer("Message retransmission", resubmissionBackoffTime, () =>
            this.#retransmitMessage(message, expectedProcessingTimeMs),
        ).start();
    }

    [Symbol.asyncDispose]() {
        return this.destroy();
    }

    async destroy() {
        if (this.#isDestroyed) {
            return;
        }
        this.#isDestroyed = true;
        if (this.#closeTimer === undefined && this.#receivedMessageToAck !== undefined) {
            this.#receivedMessageAckTimer.stop();
            const messageToAck = this.#receivedMessageToAck;
            this.#receivedMessageToAck = undefined;
            try {
                await this.#sendStandaloneAckForMessage(messageToAck);
            } catch (error) {
                logger.error("An error happened when closing the exchange", error);
            }
        }
        await this.#close();
    }

    startTimedInteraction(timeout: Duration) {
        if (this.#timedInteractionTimer !== undefined && this.#timedInteractionTimer.isRunning) {
            this.#timedInteractionTimer.stop();
            throw new StatusResponseError(
                "Timed interaction already running for this exchange",
                StatusCode.InvalidAction,
            );
        }

        logger.debug(
            "Starting timed interaction",
            Mark.INBOUND,
            this.channel.name,
            Diagnostic.dict({ exId: this.#exchangeId, timeout: Duration.format(timeout) }),
        );
        this.#timedInteractionTimer = Time.getTimer("Timed interaction", timeout, () => {
            logger.debug(
                "Timed interaction timeout!",
                Diagnostic.dict({ exId: this.#exchangeId, via: this.channel.name }),
            );
        }).start();
    }

    clearTimedInteraction() {
        if (this.#timedInteractionTimer !== undefined) {
            logger.debug(
                "Clearing timed interaction",
                Diagnostic.dict({ exId: this.#exchangeId, via: this.channel.name }),
            );
            this.#timedInteractionTimer.stop();
            this.#timedInteractionTimer = undefined;
        }
    }

    hasTimedInteraction() {
        return this.#timedInteractionTimer !== undefined;
    }

    hasActiveTimedInteraction() {
        return this.#timedInteractionTimer !== undefined && this.#timedInteractionTimer.isRunning;
    }

    hasExpiredTimedInteraction() {
        return this.#timedInteractionTimer !== undefined && !this.#timedInteractionTimer.isRunning;
    }

    /**
     * Closes the exchange.
     * If force is true, the exchange will be closed immediately, even if there are still messages to send.
     * If force is false, the exchange will be closed only after all messages have been sent.
     */
    async close(force = false) {
        if (this.#isDestroyed) {
            return;
        }

        this.#lifetime.closing();

        if (this.#closeTimer !== undefined) {
            if (force) {
                // Force close does not wait any longer
                this.#closeTimer.stop();
                return this.#close();
            }
            // close was already called, so let retries happen because close not forced
            return;
        }
        if (!this.#used) {
            // The exchange was never in use, so we can close it directly
            // If we see that in the wild, we should fix the reasons
            logger.info(this.via, `Exchange never used, closing directly`);
            return this.#close();
        }
        await this.#closing.emit(true);

        if (this.#receivedMessageToAck !== undefined) {
            this.#receivedMessageAckTimer.stop();
            const messageToAck = this.#receivedMessageToAck;
            this.#receivedMessageToAck = undefined;
            try {
                await this.#sendStandaloneAckForMessage(messageToAck);
            } catch (error) {
                logger.error(this.via, `Unhandled error closing exchange`, error);
            }
            if (force) {
                // We have sent the Ack, so close here, no retries needed
                return this.#close();
            }
        } else if (this.#sentMessageToAck === undefined || force) {
            // No message left that we need to ack and no sent message left that waits for an ack, close directly
            return this.#close();
        }

        // Wait until all potential outstanding Resubmissions are done, also for Standalone-Acks.
        // We might wait a bit longer than needed, but because this is mainly a failsafe mechanism, it is acceptable.
        // in normal case this timer is cancelled before it triggers when all retries are done.
        let maxResubmissionTime = Instant;
        for (let i = this.#retransmissionCounter; i <= MRP.MAX_TRANSMISSIONS; i++) {
            maxResubmissionTime = Millis(maxResubmissionTime + this.channel.getMrpResubmissionBackOffTime(i));
        }
        this.#closeTimer = Time.getTimer(
            `Exchange ${this.via} close`,
            maxResubmissionTime,
            async () => await this.#close(),
        ).start();
    }

    async #close() {
        using _closing = this.#lifetime.closing();

        this.#retransmissionTimer?.stop();
        this.#sentMessageAckSuccess?.(undefined);

        this.#closeTimer?.stop();
        this.#timedInteractionTimer?.stop();
        this.#messagesQueue.close();

        await this.#closed.emit(true);
    }

    get via() {
        if (this.session === undefined) {
            return Diagnostic.via(`${Mark.EXCHANGE}${this.idStr}`);
        }

        return Diagnostic.via(`${this.session.via}${Mark.EXCHANGE}${this.idStr}`);
    }
}

export namespace MessageExchange {
    export interface Config {
        context: MessageExchangeContext;
        isInitiator: boolean;
        peerSessionId: number;
        nodeId?: NodeId;
        peerNodeId?: NodeId;
        exchangeId: number;
        protocolId: number;
    }
}
