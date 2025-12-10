/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedMessage, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import {
    BasicMultiplex,
    Bytes,
    Channel,
    ConnectionlessTransport,
    ConnectionlessTransportSet,
    Diagnostic,
    Entropy,
    Environment,
    Environmental,
    hex,
    ImplementationError,
    Lifetime,
    Logger,
    MatterFlowError,
    ObserverGroup,
    UdpInterface,
    UnexpectedDataError,
} from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { DEFAULT_EXPECTED_PROCESSING_TIME } from "#protocol/MessageChannel.js";
import { SecureChannelMessenger } from "#securechannel/SecureChannelMessenger.js";
import { NodeSession } from "#session/NodeSession.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { UNICAST_UNSECURE_SESSION_ID } from "#session/UnsecuredSession.js";
import { NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "#types";
import { MessageExchange, MessageExchangeContext } from "./MessageExchange.js";
import { DuplicateMessageError } from "./MessageReceptionState.js";
import { ProtocolHandler } from "./ProtocolHandler.js";

const logger = Logger.get("ExchangeManager");

/**
 * Maximum number of concurrent outgoing exchanges per session.
 * We chose 30 under the assumption that each exchange has one message in flight and the usual SecureSession message
 * counter window tracks 32 messages. So we have "2 spare messages" if really someone uses that many parallel exchanges.
 * TODO: Change this into an exchange creation queue instead of hard limiting it.
 */
const MAXIMUM_CONCURRENT_OUTGOING_EXCHANGES_PER_SESSION = 30;

/**
 * Interfaces {@link ExchangeManager} with other components.
 */
export interface ExchangeManagerContext {
    lifetime: Lifetime.Owner;
    entropy: Entropy;
    netInterface: ConnectionlessTransportSet;
    sessions: SessionManager;
}

export class ExchangeManager {
    readonly #lifetime: Lifetime;
    readonly #transports: ConnectionlessTransportSet;
    readonly #sessions: SessionManager;
    readonly #exchangeCounter: ExchangeCounter;
    readonly #exchanges = new Map<number, MessageExchange>();
    readonly #protocols = new Map<number, ProtocolHandler>();
    readonly #listeners = new Map<ConnectionlessTransport, ConnectionlessTransport.Listener>();
    readonly #workers: BasicMultiplex;
    readonly #observers = new ObserverGroup(this);
    readonly #sessionObservers = new Map<Session, ObserverGroup>();
    #isClosing = false;

    constructor(context: ExchangeManagerContext) {
        this.#lifetime = context.lifetime.join("exchanges");
        this.#workers = new BasicMultiplex();
        this.#transports = context.netInterface;
        this.#sessions = context.sessions;
        this.#exchangeCounter = new ExchangeCounter(context.entropy);

        for (const netInterface of this.#transports) {
            this.#addTransport(netInterface);
        }

        this.#observers.on(this.#transports.added, this.#addTransport);
        this.#observers.on(this.#transports.deleted, this.#deleteTransport);
        this.#observers.on(this.#sessions.sessions.added, this.#addSession);
        this.#observers.on(this.#sessions.sessions.deleted, this.#deleteSession);
    }

    static [Environmental.create](env: Environment) {
        const instance = new ExchangeManager({
            lifetime: env,
            entropy: env.get(Entropy),
            netInterface: env.get(ConnectionlessTransportSet),
            sessions: env.get(SessionManager),
        });
        env.set(ExchangeManager, instance);
        return instance;
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
        return this.initiateExchangeForSession(this.#sessions.sessionFor(address), protocolId);
    }

    initiateExchangeForSession(session: Session, protocolId: number) {
        const exchangeId = this.#exchangeCounter.getIncrementedCounter();
        const exchangeIndex = exchangeId | 0x10000; // Ensure initiated and received exchange index are different, since the exchangeID can be the same
        const exchange = MessageExchange.initiate(this.#messageExchangeContextFor(session), exchangeId, protocolId);
        this.#addExchange(exchangeIndex, exchange);
        return exchange;
    }

    async close() {
        if (this.#isClosing) {
            return;
        }

        using closing = this.#lifetime.closing();

        this.#isClosing = true;

        const exchangesClosed = new BasicMultiplex();

        for (const exchange of this.#exchanges.values()) {
            exchangesClosed.add(exchange.close(true));
        }

        {
            using _closing = closing.join("exchanges");
            await exchangesClosed;
        }

        for (const listener of this.#listeners.keys()) {
            this.#deleteTransport(listener);
        }

        for (const protocol of this.#protocols.values()) {
            this.#workers.add(protocol.close());
        }

        {
            using _closing = closing.join("workers");
            await this.#workers;
        }

        this.#exchanges.clear();
        this.#observers.close();
    }

    async #onMessage(channel: Channel<Bytes>, messageBytes: Bytes) {
        using _lifetime = this.#lifetime.join("receiving from", Diagnostic.strong(channel.name));

        const packet = MessageCodec.decodePacket(messageBytes);
        const bytes = Bytes.of(messageBytes);
        const aad = bytes.slice(0, bytes.length - packet.applicationPayload.byteLength); // Header+Extensions

        const messageId = packet.header.messageId;

        let isDuplicate: boolean;
        let session: Session | undefined;
        let message: DecodedMessage | undefined;
        if (packet.header.sessionType === SessionType.Unicast) {
            if (packet.header.sessionId === UNICAST_UNSECURE_SESSION_ID) {
                if (this.#isClosing) return;
                const initiatorNodeId = packet.header.sourceNodeId ?? NodeId.UNSPECIFIED_NODE_ID;
                session =
                    this.#sessions.getUnsecuredSession(initiatorNodeId) ??
                    this.#sessions.createUnsecuredSession({
                        channel,
                        initiatorNodeId,
                    });
            } else {
                session = this.#sessions.getSession(packet.header.sessionId);
            }

            if (session === undefined) {
                logger.warn(
                    `Ignoring message for unknown session ${Session.idStrOf(packet)}${
                        packet.header.sourceNodeId !== undefined
                            ? ` from node ${hex.fixed(packet.header.sourceNodeId, 16)}`
                            : ""
                    }`,
                );
                return;
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
            if (this.#isClosing) return;
            if (packet.header.sourceNodeId === undefined) {
                throw new UnexpectedDataError("Group session message must include a source NodeId");
            }

            let key: Bytes;
            ({ session, message, key } = this.#sessions.groupSessionFromPacket(packet, aad));

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
        const messageDiagnostics = Diagnostic.dict({
            message: messageId,
            protocol: message.payloadHeader.protocolId,
            exId: message.payloadHeader.exchangeId,
            via: channel.name,
        });

        if (exchange !== undefined) {
            this.#lifetime.details.exchange = exchange.idStr;
            if (exchange.session.id !== packet.header.sessionId || (exchange.considerClosed && !isStandaloneAck)) {
                logger.debug(
                    exchange.via,
                    "Ignore",
                    Mark.INBOUND,
                    "message because",
                    exchange.considerClosed
                        ? "exchange is closing"
                        : `session ID mismatch (header session is ${Session.idStrOf(packet)}`,
                    messageDiagnostics,
                );

                await exchange.send(SecureMessageType.StandaloneAck, new Uint8Array(0), {
                    includeAcknowledgeMessageId: message.packetHeader.messageId,
                    protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                });
                await exchange.close();
                return;
            }

            await exchange.onMessageReceived(message, isDuplicate);
        } else {
            if (this.#isClosing) return;
            if (session.isClosing) {
                logger.debug(`Declining new exchange because session ${Session.idStrOf(packet)} is closing`);
                return;
            }

            const protocolHandler = this.#protocols.get(message.payloadHeader.protocolId);

            const handlerSecurityMismatch =
                protocolHandler?.requiresSecureSession !== undefined &&
                protocolHandler.requiresSecureSession !== session.isSecure;
            // Having a "Secure Session" means it is encrypted in our internal working
            // TODO When adding Group sessions, we need to check how to adjust that handling
            if (handlerSecurityMismatch) {
                logger.debug(
                    "Ignore",
                    Mark.INBOUND,
                    `message because not matching the security requirements (${protocolHandler.requiresSecureSession} vs. ${session.isSecure})`,
                    messageDiagnostics,
                );
            }

            if (
                protocolHandler !== undefined &&
                message.payloadHeader.isInitiatorMessage &&
                !isDuplicate &&
                !handlerSecurityMismatch
            ) {
                if (isStandaloneAck && !message.payloadHeader.requiresAck) {
                    logger.debug("Ignore", Mark.INBOUND, "unsolicited standalone ack message", messageDiagnostics);
                    return;
                }

                const exchange = MessageExchange.fromInitialMessage(this.#messageExchangeContextFor(session), message);
                this.#lifetime.details.exchange = exchange.idStr;
                this.#addExchange(exchangeIndex, exchange);
                await exchange.onMessageReceived(message);
                await protocolHandler.onNewExchange(exchange, message);
            } else if (message.payloadHeader.requiresAck) {
                const exchange = MessageExchange.fromInitialMessage(this.#messageExchangeContextFor(session), message);
                this.#lifetime.details.exchange = exchange.idStr;
                this.#addExchange(exchangeIndex, exchange);
                await exchange.send(SecureMessageType.StandaloneAck, new Uint8Array(0), {
                    includeAcknowledgeMessageId: message.packetHeader.messageId,
                    protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                });
                await exchange.close();
                logger.debug("Ignore", Mark.INBOUND, "unsolicited message", messageDiagnostics);
            } else {
                if (protocolHandler === undefined) {
                    throw new MatterFlowError(`Unsupported protocol ${message.payloadHeader.protocolId}`);
                }
                if (isDuplicate) {
                    if (message.packetHeader.destGroupId === undefined) {
                        // Duplicate Non-Group messages are still interesting to log to know them
                        logger.debug("Ignore", Mark.INBOUND, "duplicate message", messageDiagnostics);
                    }
                    return;
                }
                if (!isStandaloneAck) {
                    logger.info(
                        "Discard",
                        Mark.INBOUND,
                        "unexpected message",
                        messageDiagnostics,
                        Diagnostic.json(message),
                    );
                }
            }
        }
    }

    async deleteExchange(exchangeIndex: number) {
        this.#exchanges.delete(exchangeIndex);
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
            exchange => exchange.session.id === sessionId && !exchange.considerClosed,
        );
        if (sessionExchanges.length <= MAXIMUM_CONCURRENT_OUTGOING_EXCHANGES_PER_SESSION) {
            return;
        }
        // let's use the first entry in the Map as the oldest exchange and close it
        // TODO: Adjust this logic into a Exchange creation queue instead of hard closing
        const exchangeToClose = sessionExchanges[0];
        logger.info(
            exchangeToClose.via,
            `Closing oldest exchange for session because of too many concurrent outgoing exchanges. Ensure to not send that many parallel messages to one peer.`,
        );
        logger.debug(exchangeToClose.via, "Closing oldest exchange");
        this.#workers.add(exchangeToClose.close());
    }

    calculateMaximumPeerResponseTimeMsFor(session: Session, expectedProcessingTime = DEFAULT_EXPECTED_PROCESSING_TIME) {
        return session.channel.calculateMaximumPeerResponseTime(
            session.parameters,
            this.#sessions.sessionParameters,
            expectedProcessingTime,
        );
    }

    #messageExchangeContextFor(session: Session): MessageExchangeContext {
        return {
            session,
            localSessionParameters: this.#sessions.sessionParameters,
            retry: number => this.#sessions.retry.emit(session, number),
        };
    }

    #addTransport(netInterface: ConnectionlessTransport) {
        const udpInterface = netInterface instanceof UdpInterface;
        this.#listeners.set(
            netInterface,
            netInterface.onData((socket, data) => {
                if (udpInterface && data.byteLength > socket.maxPayloadSize) {
                    logger.warn(
                        `Ignoring UDP message on channel ${socket.name} with size ${data.byteLength} from ${socket.name}, which is larger than the maximum allowed size of ${socket.maxPayloadSize}.`,
                    );
                    return;
                }

                this.#workers.add(this.#onMessage(socket, data));
            }),
        );
    }

    #deleteTransport(netInterface: ConnectionlessTransport) {
        const listener = this.#listeners.get(netInterface);
        if (listener === undefined) {
            return;
        }
        this.#listeners.delete(netInterface);

        this.#workers.add(listener.close());
    }

    #addSession(session: Session) {
        if (!(session instanceof NodeSession)) {
            return;
        }

        let observers = this.#sessionObservers.get(session);
        if (!observers) {
            this.#sessionObservers.set(session, (observers = new ObserverGroup()));
        }

        observers.on(session.gracefulClose, () => this.#sendCloseSession(session));
    }

    #deleteSession(session: Session) {
        const observers = this.#sessionObservers.get(session);
        if (!observers) {
            return;
        }

        observers.close();
        this.#sessionObservers.delete(session);
    }

    async #sendCloseSession(session: NodeSession) {
        await using exchange = this.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID);
        logger.debug(exchange.via, "Closing session");
        try {
            const messenger = new SecureChannelMessenger(exchange);
            await messenger.sendCloseSession();
            await messenger.close();
        } catch (error) {
            logger.error(exchange.via, "Error closing session:", error);
        }
    }
}

export class ExchangeCounter {
    #exchangeCounter: number;

    constructor(entropy: Entropy) {
        this.#exchangeCounter = entropy.randomUint16;
    }

    getIncrementedCounter() {
        this.#exchangeCounter++;
        if (this.#exchangeCounter > 0xffff) {
            this.#exchangeCounter = 0;
        }
        return this.#exchangeCounter;
    }
}
