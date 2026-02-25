/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, PacketHeader, SessionType } from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import {
    Abort,
    AbortedError,
    asError,
    AsyncObservableValue,
    Bytes,
    causedBy,
    ClosedError,
    createPromise,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    DataReadQueue,
    Diagnostic,
    Duration,
    Forever,
    hex,
    Instant,
    InternalError,
    Lifetime,
    Logger,
    MatterFlowError,
    Millis,
    NetworkError,
    Time,
    TimeoutError,
    Timer,
    Timestamp,
} from "#general";
import { PeerUnresponsiveError, TransientPeerCommunicationError } from "#peer/PeerCommunicationError.js";
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
import { SessionClosedError, UnexpectedMessageError } from "./errors.js";
import { MessageChannel } from "./MessageChannel.js";
import { MRP } from "./MRP.js";

const logger = Logger.get("MessageExchange");

export type ExchangeLogContext = Record<string, unknown>;

export interface ExchangeSendOptions {
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

    /**
     * Disables the MRP logic which means that no retransmissions are done and receiving an ack is not awaited.
     */
    disableMrpLogic?: boolean;

    /** Additional context information for logging to be included at the beginning of the Message log. */
    logContext?: ExchangeLogContext;

    /** Aborts sending; does not throw */
    abort?: AbortSignal;

    /** Number of MRP retries to attempt (default: MRP.MAX_TRANSMISSIONS) */
    maxRetransmissions?: number;

    /** Maximum MRP retransmission time (default: unlimited) */
    maxRetransmissionTime?: Duration;

    /** Initial MRP retransmission time (default: calculated as by Matter specification) */
    initialRetransmissionTime?: Duration;
}

export interface ExchangeReceiveOptions {
    /** Aborts sending; does not throw */
    abort?: AbortSignal;

    timeout?: Duration;

    /**
     * Defined an expected processing time by the responder for the message. This is used to calculate the final
     * timeout for responses together with the normal retransmission logic when MRP is used.
     */
    expectedProcessingTime?: Duration;
}

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
    localSessionParameters: SessionParameters;

    peerLost(exchange: MessageExchange, cause: Error): Promise<void>;

    /** @deprecated */
    retry(number: number): void;
}

/**
 * A Matter "message exchange" is a sequence of messages associated with a single interaction.
 *
 * TODO - rewrite main send retransmission loop using sleeps instead of timers
 * TODO - track dangling promises (annotated with TODO)
 * TODO - replace throws with logging for some errors triggered by peer
 */
export class MessageExchange {
    static fromInitialMessage(
        context: MessageExchangeContext,
        initialMessage: Message,
        options?: MessageExchange.Options,
    ) {
        const { session } = context;
        return new MessageExchange({
            context,
            isInitiator: false,
            peerSessionId: session.id,
            nodeId: initialMessage.packetHeader.destNodeId,
            peerNodeId: initialMessage.packetHeader.sourceNodeId,
            exchangeId: initialMessage.payloadHeader.exchangeId,
            protocolId: initialMessage.payloadHeader.protocolId,
            ...options,
        });
    }

    static initiate(
        context: MessageExchangeContext,
        exchangeId: number,
        protocolId: number,
        options?: MessageExchange.Options,
    ) {
        const { session } = context;
        return new MessageExchange({
            context,
            isInitiator: true,
            peerSessionId: session.peerSessionId,
            nodeId: session.nodeId,
            peerNodeId: session.peerNodeId,
            exchangeId,
            protocolId,
            ...options,
        });
    }

    readonly #context: MessageExchangeContext;
    readonly #isInitiator: boolean;
    readonly #messagesQueue = new DataReadQueue<Message>();
    readonly #lifetime: Lifetime;
    readonly #onSend?: MessageExchange.SendNotifier;
    readonly #onReceive?: MessageExchange.ReceiveNotifier;
    #receivedMessageToAck: Message | undefined;
    #receivedMessageAckTimer = Time.getTimer("ack receipt timeout", MRP.STANDALONE_ACK_TIMEOUT, () => {
        if (this.#receivedMessageToAck !== undefined) {
            const messageToAck = this.#receivedMessageToAck;
            this.#receivedMessageToAck = undefined;
            // TODO await
            this.sendStandaloneAckForMessage(messageToAck).catch(error =>
                logger.error("An error happened when sending a standalone ack", error),
            );
        }
    });

    #closeTimer: Timer | undefined;
    #closeCause?: Error;
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
    #channel?: MessageChannel;

    // TODO - following are associated with current active transmission and should maybe go in a closure
    #sentMessageToAck?: Message;
    #sentMessageAckSuccess?: (message: Message | undefined) => void;
    #sentMessageAckFailure?: () => void;
    #sendOptions: ExchangeSendOptions = {};
    #retransmissionCounter = 0;
    #totalRetransmissionCounter = 0; // counter for all messages within this exchange
    #messageSendCounter = 0;
    #messageReceivedCounter = 0;
    #retransmissionTimer?: Timer;
    #kick?: () => void;

    constructor(config: MessageExchange.Config) {
        const { context, isInitiator, peerSessionId, nodeId, peerNodeId, exchangeId, protocolId, onSend, onReceive } =
            config;

        this.#context = context;
        this.#isInitiator = isInitiator;
        this.#peerSessionId = peerSessionId;
        this.#nodeId = nodeId;
        this.#peerNodeId = peerNodeId;
        this.#exchangeId = exchangeId;
        this.#protocolId = protocolId;
        this.#onSend = onSend;
        this.#onReceive = onReceive;

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
        if (this.#channel === undefined) {
            this.#channel = this.session.channel;
        }
        return this.#channel;
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
        this.#messageReceivedCounter++;

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
        this.#onReceive?.(message, duplicate);

        if (duplicate) {
            // Received a message retransmission, but the reply is not ready yet, ignoring
            if (requiresAck) {
                await this.sendStandaloneAckForMessage(message);
            }
            return;
        }
        if (messageId === this.#sentMessageToAck?.payloadHeader.ackedMessageId) {
            // Received a message retransmission. This means that the other side didn't get our ack
            // Resending the previous reply message which contains the ack
            using _acking = this.join("resending ack");
            this.#messageSendCounter++;
            await this.channel.send(this.#sentMessageToAck, this);
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
                        `Incorrect ack received. Expected ${hex.fixed(sentMessageIdToAck, 8)}, received: ${hex.fixed(ackedMessageId, 8)}`,
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
                    // All retransmissions done and in closing, no need to wait further
                    return this.#close();
                }
            }
        }
        if (isStandaloneAck) {
            // Don't include standalone acks in the message stream
            return;
        }
        if (requiresAck) {
            // We still have a message to ack, so ack the old one as standalone ack directly
            if (this.#receivedMessageToAck !== undefined) {
                this.#receivedMessageAckTimer.stop();
                await this.sendStandaloneAckForMessage(this.#receivedMessageToAck);
            }
            this.#receivedMessageToAck = message;
            this.#receivedMessageAckTimer.start();
        }
        this.#messagesQueue.write(message);
    }

    async send(messageType: number, payload: Bytes, options: ExchangeSendOptions = {}) {
        if (this.#closeCause) {
            throw new ClosedError("Exchange is closed", { cause: this.#closeCause });
        }

        this.#sendOptions = options;
        this.#retransmissionCounter = 0;

        try {
            await this.#send(messageType, payload);
        } catch (e) {
            if (causedBy(e, TransientPeerCommunicationError, TimeoutError, NetworkError)) {
                await this.#context.peerLost(this, asError(e));
            }

            throw e;
        } finally {
            this.#kick = undefined;
        }
    }

    async #send(messageType: number, payload: Bytes, standaloneAckMessageId?: number) {
        const {
            expectAckOnly = false,
            disableMrpLogic,
            expectedProcessingTime = MRP.DEFAULT_EXPECTED_PROCESSING_TIME,
            logContext = {},
        } = this.#sendOptions;

        using abort = new Abort(this.#sendOptions);

        const isStandaloneAck = standaloneAckMessageId !== undefined;
        if (standaloneAckMessageId !== undefined) {
            if (!this.session.usesMrp) {
                throw new InternalError("Cannot include an acknowledge message ID when MRP is not used");
            }
            if (messageType !== SecureMessageType.StandaloneAck) {
                throw new InternalError("Cannot override an acknowledge message ID for non-standalone acks");
            }
        }

        let { requiresAck } = this.#sendOptions;
        if (requiresAck && !(this.session.usesMrp || (this.session as NodeSession).isPeerLost)) {
            requiresAck = false;
        }

        // Standalone acks are always sent via the SECURE_CHANNEL_PROTOCOL_ID
        const protocolId = isStandaloneAck ? SECURE_CHANNEL_PROTOCOL_ID : this.#protocolId;
        if (isStandaloneAck) {
            if (!this.session.usesMrp) {
                return;
            }
            if (requiresAck) {
                throw new MatterFlowError("A standalone ack may not require acknowledgement");
            }
        }
        if (this.#sentMessageToAck !== undefined && !isStandaloneAck) {
            throw new MatterFlowError(
                `The previous message ${Message.via(this, this.#sentMessageToAck)} has not been acked yet, cannot send a new message`,
            );
        }

        this.#used = true;
        this.#messageSendCounter++;
        this.session.notifyActivity(false);

        let ackedMessageId = standaloneAckMessageId;
        if (ackedMessageId === undefined && this.session.usesMrp) {
            ackedMessageId = this.#receivedMessageToAck?.packetHeader.messageId;
            if (ackedMessageId !== undefined) {
                this.#receivedMessageAckTimer.stop();
                this.#receivedMessageToAck = undefined;
            }
        }

        let packetHeader: PacketHeader;
        if (this.session.type === SessionType.Unicast) {
            const messageId = isStandaloneAck
                ? await this.session.getIncrementedMessageCounter() // Standalone acks always need to be sendable
                : await abort.attempt(this.session.getIncrementedMessageCounter());
            if (messageId === undefined) {
                return;
            }
            packetHeader = {
                sessionId: this.#peerSessionId,
                sessionType: SessionType.Unicast,
                messageId,
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
            const messageId = await abort.attempt(this.session.getIncrementedMessageCounter());
            if (messageId === undefined) {
                return;
            }
            packetHeader = {
                sessionId: this.#peerSessionId,
                sessionType: SessionType.Group,
                messageId,
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
            const backOff = this.#mrpResubmissionBackOffTime;
            logContext.backOff = Duration.format(backOff);
            this.#retransmissionTimer = Time.getTimer(`retransmitting ${Message.via(this, message)}`, backOff, () =>
                this.#retransmitMessage(message, expectedProcessingTime),
            );
            this.#kick = () => {
                if (this.#retransmissionTimer?.isRunning) {
                    this.#retransmissionTimer.stop();
                    this.#retransmitMessage(message, expectedProcessingTime);
                }
            };
            const { promise, resolver } = createPromise<Message | undefined>();
            ackPromise = promise;
            this.#sentMessageAckSuccess = resolver;
            const startedWaitingAt = Time.nowMs;
            this.#sentMessageAckFailure = () => {
                abort.abort(new PeerUnresponsiveError(Timestamp.delta(startedWaitingAt)));
            };
        }

        this.#onSend?.(message, 0);
        using sending = this.join("sending", Diagnostic.strong(Message.via(this, message)));
        if (isStandaloneAck) {
            await this.channel.send(message, this, logContext);
        } else {
            await abort.attempt(this.channel.send(message, this, logContext));
        }
        if (abort.aborted) {
            return;
        }

        if (ackPromise !== undefined) {
            this.#retransmissionCounter = 0;
            this.#retransmissionTimer?.start();

            // Await response.  Resolves with message when received, undefined when aborted, and rejects on timeout
            using _waiting = sending.join("waiting for ack");
            const responseMessage = await abort.attempt(ackPromise);
            if (abort.aborted) {
                // Aborted exchange caused to return undefined, any other
                // error is thrown
                if (!causedBy(abort.reason, AbortedError)) {
                    throw abort.reason;
                }
                return;
            }

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

    async nextMessage(options?: ExchangeReceiveOptions) {
        try {
            return await this.#nextMessage(options);
        } catch (e) {
            if (causedBy(e, TransientPeerCommunicationError)) {
                await this.#context.peerLost(this, asError(e));
            }

            throw e;
        }
    }

    async #nextMessage(options?: ExchangeReceiveOptions) {
        let timeout: Duration | undefined;

        if (options?.timeout !== undefined) {
            timeout = options.timeout;
        } else if (
            !this.session.isClosed &&
            ((!this.#sendOptions.abort && !options?.abort) || options?.expectedProcessingTime !== undefined)
        ) {
            timeout = this.channel.calculateMaximumPeerResponseTime(
                this.session.parameters,
                this.context.localSessionParameters,
                options?.expectedProcessingTime,
            );
        }

        using localAbort = new Abort({
            timeout,
            abort: options?.abort,

            timeoutHandler: () => {
                throw new PeerUnresponsiveError(timeout!);
            },
        });

        return await this.#messagesQueue.read(localAbort);
    }

    /**
     * If a transmission using MRP is active, short-circuits the MRP loop and sends the next packet immediately.
     */
    kick() {
        this.#kick?.();
    }

    async sendStandaloneAckForMessage(message: Message) {
        const {
            packetHeader: { messageId },
            payloadHeader: { requiresAck },
        } = message;
        if (!requiresAck || !this.session.usesMrp) {
            return;
        }

        await this.#send(SecureMessageType.StandaloneAck, new Uint8Array(0), messageId);
    }

    #retransmitMessage(message: Message, expectedProcessingTime?: Duration) {
        this.#retransmissionCounter++;
        this.#totalRetransmissionCounter++;
        if (
            this.considerClosed ||
            this.#retransmissionCounter >= (this.#sendOptions.maxRetransmissions ?? MRP.MAX_TRANSMISSIONS)
        ) {
            // Ok all resubmissions are done, but we need to wait a bit longer because of processing time and the
            // resubmissions from the other side
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
                    this.#totalRetransmissionCounter--;
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
                this.#sentMessageAckFailure();
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

        this.#messageSendCounter++;
        this.session.notifyActivity(false);

        this.context.retry(this.#retransmissionCounter);
        const resubmissionBackoffTime = this.#mrpResubmissionBackOffTime;

        this.#onSend?.(message, this.#retransmissionCounter);

        // TODO await
        this.channel
            .send(message, this, {
                "retrans#": this.#retransmissionCounter,
                backoff: Duration.format(resubmissionBackoffTime),
            })
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
                await this.sendStandaloneAckForMessage(messageToAck);
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
     *
     * If cause is defined, the exchange is closed immediately, even if there are still messages to send.  Further
     * attempts at communicating via the exchange will throw this error.
     *
     * If cause is undefined, the exchange is closed only after all messages have been sent.
     */
    async close(cause?: Error) {
        if (this.#isDestroyed) {
            return;
        }

        using closing = this.#lifetime.closing();

        if (this.#closeTimer !== undefined) {
            if (cause) {
                // Force close does not wait any longer
                this.#closeTimer.stop();
                return this.#close(cause);
            }
            // close was already called, so let retries happen because close not forced
            return;
        }
        if (!this.#used) {
            // The exchange was never in use, so we can close it directly
            // If we see that in the wild, we should fix the reasons
            logger.info(this.via, `Exchange never used, closing directly`);
            return this.#close(cause);
        }

        {
            using _emitting = closing.join("emitting");
            await this.#closing.emit(true);
        }

        if (this.#receivedMessageToAck !== undefined) {
            this.#receivedMessageAckTimer.stop();
            const messageToAck = this.#receivedMessageToAck;
            this.#receivedMessageToAck = undefined;
            try {
                using _acking = closing.join("acking");
                await this.sendStandaloneAckForMessage(messageToAck);
            } catch (error) {
                logger.error(this.via, `Unhandled error closing exchange`, error);
            }
            if (cause) {
                // We have sent the Ack, so close here, no retries needed
                await this.#close(cause);
                return;
            }
        } else if (this.#sentMessageToAck === undefined || cause) {
            // No message left that we need to ack and no sent message left that waits for an ack, close directly
            await this.#close(cause);
            return;
        }

        // Wait until all potential outstanding Resubmissions are done (up to default of MRP.MAX_TRANSMISSIONS), also
        // for Standalone-Acks.
        //
        // We might wait a bit longer than needed, but because this is mainly a failsafe mechanism, it is acceptable.
        // Normal this timer is cancelled before it triggers when all retries are done.
        let maxResubmissionTime = Instant;
        for (let i = this.#retransmissionCounter; i <= MRP.MAX_TRANSMISSIONS; i++) {
            maxResubmissionTime = Millis(
                maxResubmissionTime + this.channel.getMrpResubmissionBackOffTime(i, undefined, true),
            );
        }
        this.#closeTimer = Time.getTimer(
            `Exchange ${this.via} close`,
            maxResubmissionTime,
            async () => await this.#close(cause),
        ).start();
    }

    async #close(cause?: Error) {
        using _closing = this.#lifetime.closing();

        if (this.#closeCause === undefined) {
            this.#closeCause = cause;
        }

        this.#retransmissionTimer?.stop();
        this.#sentMessageAckSuccess?.(undefined);

        this.#closeTimer?.stop();
        this.#timedInteractionTimer?.stop();
        this.#messagesQueue.close(this.#closeCause);

        await this.#closed.emit(true);
    }

    get via() {
        if (this.session === undefined) {
            return Diagnostic.via(`${Mark.EXCHANGE}${this.idStr}`);
        }

        return Diagnostic.via(`${this.session.via}${Mark.EXCHANGE}${this.idStr}`);
    }

    /**
     * Expose some diagnostics for logging.
     * For simply one message exchanges without retransmissions nothing will be exposed
     */
    get diagnostics() {
        if (
            this.#totalRetransmissionCounter === 0 &&
            this.#messageSendCounter === 1 &&
            this.#messageReceivedCounter === 1
        ) {
            return "";
        }
        return `${this.#messageReceivedCounter}${Mark.TRANSFERRED}${this.#messageSendCounter}${this.#totalRetransmissionCounter > 0 ? `+${this.#totalRetransmissionCounter}` : ""}`;
    }

    get #mrpResubmissionBackOffTime() {
        let backOff = this.channel.getMrpResubmissionBackOffTime(this.#retransmissionCounter);
        if (this.#sendOptions.initialRetransmissionTime !== undefined) {
            backOff = Millis(backOff + this.#sendOptions.initialRetransmissionTime);
        }
        return Duration.min(backOff, this.#sendOptions.maxRetransmissionTime ?? Forever);
    }
}

export namespace MessageExchange {
    export interface Options {
        /**
         * Invoked when a message transmits
         */
        onSend?: SendNotifier;

        /**
         * Invoked upon message receipt.
         */
        onReceive?: ReceiveNotifier;
    }

    export interface Config extends Options {
        context: MessageExchangeContext;
        isInitiator: boolean;
        peerSessionId: number;
        nodeId?: NodeId;
        peerNodeId?: NodeId;
        exchangeId: number;
        protocolId: number;
    }

    /**
     * Callback invoked by exchange before message transmission.
     */
    export type SendNotifier = (message: Message, retransmission: number) => void;

    /**
     * Callback invoked by exchange after message receipt.
     */
    export type ReceiveNotifier = (message: Message, duplicate: boolean) => void;
}
