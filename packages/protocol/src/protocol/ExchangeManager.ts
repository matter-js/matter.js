/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedMessage, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import {
    Channel,
    Crypto,
    Diagnostic,
    Environment,
    Environmental,
    ImplementationError,
    Logger,
    MatterAggregateError,
    MatterError,
    MatterFlowError,
    ObserverGroup,
    TransportInterface,
    TransportInterfaceSet,
    UdpInterface,
    UnexpectedDataError,
} from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import {
    ChannelNotConnectedError,
    DEFAULT_EXPECTED_PROCESSING_TIME_MS,
    MessageChannel,
} from "#protocol/MessageChannel.js";
import { SecureChannelMessenger } from "#securechannel/SecureChannelMessenger.js";
import { UNICAST_UNSECURE_SESSION_ID } from "#session/InsecureSession.js";
import { NodeSession } from "#session/NodeSession.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "#types";
import { ChannelManager } from "./ChannelManager.js";
import { MessageExchange, MessageExchangeContext } from "./MessageExchange.js";
import { DuplicateMessageError } from "./MessageReceptionState.js";
import { ProtocolHandler } from "./ProtocolHandler.js";

const logger = Logger.get("ExchangeManager");

const MAXIMUM_CONCURRENT_EXCHANGES_PER_SESSION = 5;

/**
 * Interfaces {@link ExchangeManager} with other components.
 */
export interface ExchangeManagerContext {
    crypto: Crypto;
    transportInterfaces: TransportInterfaceSet;
    sessionManager: SessionManager;
    channelManager: ChannelManager;
}

export class ExchangeManager {
    readonly #transportInterfaces: TransportInterfaceSet;
    readonly #sessionManager: SessionManager;
    readonly #channelManager: ChannelManager;
    readonly #exchangeCounter: ExchangeCounter;
    readonly #exchanges = new Map<number, MessageExchange>();
    readonly #protocols = new Map<number, ProtocolHandler>();
    readonly #listeners = new Map<TransportInterface, TransportInterface.Listener>();
    readonly #closers = new Set<Promise<void>>();
    readonly #observers = new ObserverGroup(this);
    #closing = false;

    constructor(context: ExchangeManagerContext) {
        this.#transportInterfaces = context.transportInterfaces;
        this.#sessionManager = context.sessionManager;
        this.#channelManager = context.channelManager;
        this.#exchangeCounter = new ExchangeCounter(context.crypto);

        for (const transportInterface of this.#transportInterfaces) {
            this.#addListener(transportInterface);
        }

        this.#observers.on(this.#transportInterfaces.added, this.#addListener);
        this.#observers.on(this.#transportInterfaces.deleted, this.#deleteListener);

        this.#observers.on(this.#sessionManager.sessions.deleted, session => {
            if (!session.closingAfterExchangeFinished) {
                // Delayed closing is executed when exchange is closed
                session.closer = this.#closeSession(session);
            }
        });
    }

    static [Environmental.create](env: Environment) {
        const instance = new ExchangeManager({
            crypto: env.get(Crypto),
            transportInterfaces: env.get(TransportInterfaceSet),
            sessionManager: env.get(SessionManager),
            channelManager: env.get(ChannelManager),
        });
        env.set(ExchangeManager, instance);
        return instance;
    }

    get channels() {
        return this.#channelManager;
    }

    hasProtocolHandler(protocolId: number) {
        return this.#protocols.has(protocolId);
    }

    getProtocolHandler(protocolId: number) {
        return this.#protocols.get(protocolId);
    }

    addProtocolHandler(protocol: ProtocolHandler) {
        if (this.hasProtocolHandler(protocol.id)) {
            throw new ImplementationError(`Handler for protocol ${protocol.id} already registered.`);
        }
        this.#protocols.set(protocol.id, protocol);
    }

    initiateExchange(address: PeerAddress, protocolId: number) {
        return this.initiateExchangeWithChannel(this.#channelManager.getChannel(address), protocolId);
    }

    initiateExchangeWithChannel(channel: MessageChannel, protocolId: number) {
        const exchangeId = this.#exchangeCounter.getIncrementedCounter();
        const exchangeIndex = exchangeId | 0x10000; // Ensure initiated and received exchange index are different, since the exchangeID can be the same
        const exchange = MessageExchange.initiate(this.#messageExchangeContextFor(channel), exchangeId, protocolId);
        this.#addExchange(exchangeIndex, exchange);
        return exchange;
    }

    async close() {
        this.#closing = true;
        for (const protocol of this.#protocols.values()) {
            await protocol.close();
        }
        for (const listeners of this.#listeners.keys()) {
            this.#deleteListener(listeners);
        }
        await MatterAggregateError.allSettled(this.#closers, "Error closing exchanges").catch(error =>
            logger.error(error),
        );
        await MatterAggregateError.allSettled(
            Array.from(this.#exchanges.values()).map(exchange => exchange.close(true)),
            "Error closing exchanges",
        ).catch(error => logger.error(error));
        this.#exchanges.clear();
    }

    private async onMessage(channel: Channel<Uint8Array>, messageBytes: Uint8Array) {
        const packet = MessageCodec.decodePacket(messageBytes);
        const aad = messageBytes.slice(0, messageBytes.length - packet.applicationPayload.length); // Header+Extensions

        const messageId = packet.header.messageId;

        let isDuplicate: boolean;
        let session: Session | undefined;
        let message: DecodedMessage | undefined;
        if (packet.header.sessionType === SessionType.Unicast) {
            if (packet.header.sessionId === UNICAST_UNSECURE_SESSION_ID) {
                if (this.#closing) return;
                const initiatorNodeId = packet.header.sourceNodeId ?? NodeId.UNSPECIFIED_NODE_ID;
                session =
                    this.#sessionManager.getUnsecureSession(initiatorNodeId) ??
                    this.#sessionManager.createInsecureSession({
                        initiatorNodeId,
                    });
            } else {
                session = this.#sessionManager.getSession(packet.header.sessionId);
            }

            if (session === undefined) {
                throw new MatterFlowError(
                    `Cannot find a session for ID ${packet.header.sessionId}${
                        packet.header.sourceNodeId !== undefined
                            ? ` and source NodeId ${packet.header.sourceNodeId}`
                            : ""
                    }`,
                );
            }

            message = session.decode(packet, aad);

            try {
                session.updateMessageCounter(messageId);
                isDuplicate = false;
            } catch (e) {
                DuplicateMessageError.accept(e);
                isDuplicate = true;
            }
        } else if (packet.header.sessionType === SessionType.Group) {
            if (this.#closing) return;
            if (packet.header.sourceNodeId === undefined) {
                throw new UnexpectedDataError("Group session message must include a source NodeId");
            }

            let key: Uint8Array;
            ({ session, message, key } = this.#sessionManager.groupSessionFromPacket(packet, aad));

            try {
                session.updateMessageCounter(messageId, packet.header.sourceNodeId, key);
                isDuplicate = false;
            } catch (e) {
                DuplicateMessageError.accept(e);
                isDuplicate = true;
            }
        } else {
            throw new MatterFlowError(`Unsupported session type: ${packet.header.sessionType}`);
        }

        const exchangeIndex = message.payloadHeader.isInitiatorMessage
            ? message.payloadHeader.exchangeId
            : message.payloadHeader.exchangeId | 0x10000;
        let exchange = this.#exchanges.get(exchangeIndex);

        if (
            exchange !== undefined &&
            (exchange.session.id !== session.id || exchange.isInitiator === message.payloadHeader.isInitiatorMessage) // Should always be ok, but just in case
        ) {
            exchange = undefined;
        }

        const isStandaloneAck = SecureMessageType.isStandaloneAck(
            message.payloadHeader.protocolId,
            message.payloadHeader.messageType,
        );
        if (exchange !== undefined) {
            if (
                exchange.requiresSecureSession !== session.isSecure ||
                exchange.session.id !== packet.header.sessionId ||
                (exchange.isClosing && !isStandaloneAck)
            ) {
                logger.debug(
                    `Ignoring message ${messageId} for protocol ${message.payloadHeader.protocolId} and exchange id ${message.payloadHeader.exchangeId} on channel ${channel.name} because ${
                        exchange.isClosing
                            ? "exchange is closing"
                            : exchange.session.id !== packet.header.sessionId
                              ? `session ID mismatch ${exchange.session.id} vs ${packet.header.sessionId}`
                              : `session security requirements (${exchange.requiresSecureSession}) not fulfilled`
                    }`,
                );
                await exchange.send(SecureMessageType.StandaloneAck, new Uint8Array(0), {
                    includeAcknowledgeMessageId: message.packetHeader.messageId,
                });
                await exchange.close();
                return;
            }

            await exchange.onMessageReceived(message, isDuplicate);
        } else {
            if (this.#closing) return;
            if (session.closingAfterExchangeFinished) {
                throw new MatterFlowError(
                    `Session with ID ${packet.header.sessionId} marked for closure, decline new exchange creation.`,
                );
            }

            const protocolHandler = this.#protocols.get(message.payloadHeader.protocolId);

            // Having a "Secure Session" means it is encrypted in our internal working
            // TODO When adding Group sessions, we need to check how to adjust that handling
            if (protocolHandler !== undefined && protocolHandler.requiresSecureSession !== session.isSecure) {
                logger.debug(
                    `Ignoring message ${messageId} for protocol ${message.payloadHeader.protocolId} and exchange id ${message.payloadHeader.exchangeId} on channel ${channel.name} because not matching the security requirements.`,
                );
            }

            if (
                protocolHandler !== undefined &&
                message.payloadHeader.isInitiatorMessage &&
                !isDuplicate &&
                protocolHandler.requiresSecureSession === session.isSecure
            ) {
                if (isStandaloneAck && !message.payloadHeader.requiresAck) {
                    logger.debug(
                        `Ignoring unsolicited standalone ack message ${messageId} for protocol ${message.payloadHeader.protocolId} and exchange id ${message.payloadHeader.exchangeId} on channel ${channel.name}`,
                    );
                    return;
                }

                const exchange = MessageExchange.fromInitialMessage(
                    this.#messageExchangeContextFor(await this.#channelManager.getOrCreateChannel(channel, session)),
                    message,
                );
                this.#addExchange(exchangeIndex, exchange);
                await exchange.onMessageReceived(message);
                await protocolHandler.onNewExchange(exchange, message);
            } else if (message.payloadHeader.requiresAck) {
                const exchange = MessageExchange.fromInitialMessage(
                    this.#messageExchangeContextFor(await this.#channelManager.getOrCreateChannel(channel, session)),
                    message,
                );
                this.#addExchange(exchangeIndex, exchange);
                await exchange.send(SecureMessageType.StandaloneAck, new Uint8Array(0), {
                    includeAcknowledgeMessageId: message.packetHeader.messageId,
                });
                await exchange.close();
                logger.debug(
                    `Ignoring unsolicited message ${messageId} for protocol ${message.payloadHeader.protocolId} on channel ${channel.name}`,
                );
            } else {
                if (protocolHandler === undefined) {
                    throw new MatterFlowError(`Unsupported protocol ${message.payloadHeader.protocolId}`);
                }
                if (isDuplicate) {
                    if (message.packetHeader.destGroupId === undefined) {
                        // Duplicate Non-Group messages are still interesting to log to know them
                        logger.info(
                            `Ignoring duplicate message ${messageId} (requires no ack) for protocol ${message.payloadHeader.protocolId} on channel ${channel.name}`,
                        );
                    }
                    return;
                } else {
                    logger.info(
                        `Discarding unexpected message ${messageId} for protocol ${
                            message.payloadHeader.protocolId
                        }, exchangeIndex ${exchangeIndex} and sessionId ${session.id} on channel ${channel.name}: ${Diagnostic.json(message)}`,
                    );
                }
            }
        }
    }

    async deleteExchange(exchangeIndex: number) {
        const exchange = this.#exchanges.get(exchangeIndex);
        if (exchange === undefined) {
            logger.info(`Exchange with index ${exchangeIndex} to delete not found or already deleted.`);
            return;
        }
        const { session } = exchange;
        this.#exchanges.delete(exchangeIndex);
        if (NodeSession.is(session) && session.closingAfterExchangeFinished) {
            logger.debug(
                `Exchange index ${exchangeIndex} on Session ${session.name} is already marked for closure. Close session now.`,
            );
            try {
                await this.#closeSession(session);
            } catch (error) {
                logger.error(`Error closing session ${session.name}. Ignoring.`, error);
            }
        }
    }

    async #closeSession(session: NodeSession) {
        const sessionId = session.id;
        const sessionName = session.name;

        const asExchangeSession = session as { closedByExchange?: boolean };
        if (asExchangeSession.closedByExchange) {
            // Session already removed, so we do not need to close again
            return;
        }
        asExchangeSession.closedByExchange = true;

        for (const [_exchangeIndex, exchange] of this.#exchanges.entries()) {
            if (exchange.session.id === sessionId) {
                await exchange.destroy();
            }
        }
        if (session.sendCloseMessageWhenClosing) {
            const channel = this.#channelManager.getChannelForSession(session);
            logger.debug(`Channel for session ${sessionName} is ${channel?.name}`);
            if (channel !== undefined) {
                const exchange = this.initiateExchangeWithChannel(channel, SECURE_CHANNEL_PROTOCOL_ID);
                logger.debug(`Initiated exchange ${exchange.id} to close session ${sessionName}`);
                try {
                    const messenger = new SecureChannelMessenger(exchange);
                    await messenger.sendCloseSession();
                    await messenger.close();
                } catch (error) {
                    if (error instanceof ChannelNotConnectedError) {
                        logger.debug("Session already closed because channel is disconnected.");
                    } else {
                        logger.error("Error closing session", error);
                    }
                }
                await exchange.destroy();
            }
        }
        if (session.closingAfterExchangeFinished) {
            await session.destroy(false, false);
        }
    }

    #addExchange(exchangeIndex: number, exchange: MessageExchange) {
        exchange.closed.on(() => this.deleteExchange(exchangeIndex));
        this.#exchanges.set(exchangeIndex, exchange);

        // A node SHOULD limit itself to a maximum of 5 concurrent exchanges over a unicast session. This is
        // to prevent a node from exhausting the message counter window of the peer node.
        // TODO Make sure Group sessions are handled differently
        this.#cleanupSessionExchanges(exchange.session.id);
    }

    #cleanupSessionExchanges(sessionId: number) {
        if (sessionId === UNICAST_UNSECURE_SESSION_ID) {
            // PASE/CASE exchanges are not relevant for this limit
            return;
        }
        const sessionExchanges = Array.from(this.#exchanges.values()).filter(
            exchange => exchange.session.id === sessionId && !exchange.isClosing,
        );
        if (sessionExchanges.length <= MAXIMUM_CONCURRENT_EXCHANGES_PER_SESSION) {
            return;
        }
        // let's use the first entry in the Map as the oldest exchange and close it
        const exchangeToClose = sessionExchanges[0];
        logger.debug(`Closing oldest exchange ${exchangeToClose.id} for session ${sessionId}`);
        exchangeToClose.close().catch(error => logger.error("Error closing exchange", error)); // TODO Promise??
    }

    calculateMaximumPeerResponseTimeMsFor(
        channel: MessageChannel,
        expectedProcessingTimeMs = DEFAULT_EXPECTED_PROCESSING_TIME_MS,
    ) {
        return channel.calculateMaximumPeerResponseTimeMs(
            this.#sessionManager.sessionParameters,
            expectedProcessingTimeMs,
        );
    }

    #messageExchangeContextFor(channel: MessageChannel): MessageExchangeContext {
        return {
            channel,
            localSessionParameters: this.#sessionManager.sessionParameters,
            resubmissionStarted: () => this.#sessionManager.resubmissionStarted.emit(channel.session),
        };
    }

    #addListener(transportInterface: TransportInterface) {
        const udpInterface = transportInterface instanceof UdpInterface;
        this.#listeners.set(
            transportInterface,
            transportInterface.onData((socket, data) => {
                if (udpInterface && data.length > socket.maxPayloadSize) {
                    logger.warn(
                        `Ignoring UDP message on channel ${socket.name} with size ${data.length} from ${socket.name}, which is larger than the maximum allowed size of ${socket.maxPayloadSize}.`,
                    );
                    return;
                }

                try {
                    this.onMessage(socket, data).catch(error =>
                        logger.info(
                            `Error on channel ${socket.name}:`,
                            error instanceof MatterError ? error.message : error,
                        ),
                    );
                } catch (error) {
                    logger.info(
                        `Ignoring UDP message on channel ${socket.name} with error`,
                        error instanceof MatterError ? error.message : error,
                    );
                }
            }),
        );
    }

    #deleteListener(transportInterface: TransportInterface) {
        const listener = this.#listeners.get(transportInterface);
        if (listener === undefined) {
            return;
        }
        this.#listeners.delete(transportInterface);

        const closer = listener
            .close()
            .catch(e => logger.error("Error closing network listener", e))
            .finally(() => this.#closers.delete(closer));
        this.#closers.add(closer);
    }
}

export class ExchangeCounter {
    #exchangeCounter: number;

    constructor(crypto: Crypto) {
        this.#exchangeCounter = crypto.randomUint16;
    }

    getIncrementedCounter() {
        this.#exchangeCounter++;
        if (this.#exchangeCounter > 0xffff) {
            this.#exchangeCounter = 0;
        }
        return this.#exchangeCounter;
    }
}
