/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    DecodedMessage,
    Message,
    MessageCodec,
    SessionType,
    UNICAST_UNSECURE_SESSION_ID,
} from "#codec/MessageCodec.js";
import { Mark } from "#common/Mark.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeIdsExhaustedError } from "#protocol/errors.js";
import { SecureChannelMessenger } from "#securechannel/SecureChannelMessenger.js";
import { NodeSession } from "#session/NodeSession.js";
import { Session } from "#session/Session.js";
import { SessionManager, ShutdownError } from "#session/SessionManager.js";
import { UnsecuredSession } from "#session/UnsecuredSession.js";
import {
    asError,
    BasicMultiplex,
    Bytes,
    causedBy,
    Channel,
    CryptoDecryptError,
    ChannelType,
    Diagnostic,
    Entropy,
    Environment,
    Environmental,
    hex,
    ImplementationError,
    InternalError,
    isConnectionOrientedTransport,
    isIpNetworkChannel,
    Lifetime,
    Logger,
    MatterFlowError,
    ObserverGroup,
    Time,
    Transport,
    TransportClosedError,
    TransportSet,
    UdpTransport,
    UnexpectedDataError,
} from "@matter/general";
import { FabricIndex, NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import { MessageExchange, MessageExchangeContext } from "./MessageExchange.js";
import { DuplicateMessageError } from "./MessageReceptionState.js";
import { MRP } from "./MRP.js";
import { ProtocolHandler } from "./ProtocolHandler.js";

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

    /**
     * Where this manager's log messages come from, so a destination can attribute the ones it emits from a transport
     * callback, which carries no call stack of its own.
     */
    origin?: Diagnostic.Origin;

    entropy: Entropy;
    transports: TransportSet;
    sessions: SessionManager;
}

/**
 * Whether an error comes from the content of a received datagram: a header the codec refuses, a payload outside the
 * AES-CCM limits that the session refuses before it decrypts, a payload that does not decrypt with the session's key,
 * or a decrypted payload that does not parse.
 */
function isCausedByPeerData(error: unknown): error is UnexpectedDataError | CryptoDecryptError {
    return error instanceof UnexpectedDataError || error instanceof CryptoDecryptError;
}

export class ExchangeManager implements Transport.Provider {
    readonly #logger: Logger;
    readonly #lifetime: Lifetime;
    readonly #transports: TransportSet;
    readonly #sessions: SessionManager;
    readonly #exchangeCounter: ExchangeCounter;
    /**
     * Open exchanges per session, by exchange index.  The index is the exchange id, with bit 16 set for exchanges this
     * node initiated, so an exchange is identified by its session, its id and its role.  A session has an entry exactly
     * while it has an open exchange; only the `closed` handler of an exchange removes it.  An exchange is added only at
     * an index that is free on its session, so an index never holds more than one open exchange.
     */
    readonly #exchanges = new Map<Session, Map<number, MessageExchange>>();
    readonly #sessionsWithAuthenticationFailure = new WeakSet<Session>();
    readonly #protocols = new Map<number, ProtocolHandler>();
    readonly #listeners = new Map<Transport, Transport.Listener>();
    readonly #disconnectListeners = new Map<Transport, Transport.Listener>();
    readonly #workers: BasicMultiplex;
    readonly #observers = new ObserverGroup(this);
    readonly #sessionObservers = new Map<Session, ObserverGroup>();
    #isClosing = false;

    constructor(context: ExchangeManagerContext) {
        this.#logger = Logger.get("ExchangeManager", context.origin);
        this.#lifetime = context.lifetime.join("exchanges");
        this.#workers = new BasicMultiplex();
        this.#transports = context.transports;
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
            origin: env.logOrigin,
            entropy: env.get(Entropy),
            transports: env.get(TransportSet),
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

    interfaceFor(type: ChannelType, address?: string): Transport | undefined {
        return this.#transports.interfaceFor(type, address);
    }

    hasInterfaceFor(type: ChannelType, address?: string): boolean {
        return this.#transports.hasInterfaceFor(type, address);
    }

    initiateExchange(address: PeerAddress, protocolId: number, options?: MessageExchange.Options) {
        return this.initiateExchangeForSession(this.#sessions.sessionFor(address), protocolId, options);
    }

    initiateExchangeForSession(session: Session, protocolId: number, options?: MessageExchange.Options) {
        const exchangeId = this.#freeExchangeIdFor(session);
        const exchangeIndex = exchangeId | 0x10000; // Ensure initiated and received exchange index are different, since the exchangeID can be the same
        const exchange = MessageExchange.initiate(
            this.#messageExchangeContextFor(session),
            exchangeId,
            protocolId,
            options,
        );
        this.#addExchange(session, exchangeIndex, exchange);
        return exchange;
    }

    /**
     * The next exchange counter value that no open exchange this node started on the session uses.
     *
     * @throws ExchangeIdsExhaustedError when every one of the 65536 exchange ids is used by an open exchange this node
     *   started on the session
     */
    #freeExchangeIdFor(session: Session) {
        const openExchanges = this.#exchanges.get(session);
        for (let attempt = 0; attempt <= 0xffff; attempt++) {
            const exchangeId = this.#exchangeCounter.getIncrementedCounter();
            if (!openExchanges?.has(exchangeId | 0x10000)) {
                return exchangeId;
            }
        }
        throw new ExchangeIdsExhaustedError(`Every exchange id is in use on session ${session.via}`);
    }

    async close() {
        if (this.#isClosing) {
            return;
        }

        using closing = this.#lifetime.closing();

        this.#isClosing = true;

        const exchangesClosed = new BasicMultiplex();

        for (const exchange of [...this.#exchanges.values()].flatMap(exchanges => [...exchanges.values()])) {
            exchangesClosed.add(exchange.close(new ShutdownError("Exchange closed by node shutdown")));
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

        // Clean up any remaining session observers (safety net for shutdown ordering)
        for (const observers of this.#sessionObservers.values()) {
            observers.close();
        }
        this.#sessionObservers.clear();

        this.#observers.close();
    }

    async #onMessage(channel: Channel<Bytes>, messageBytes: Bytes) {
        using lifetime = this.#lifetime.join("receiving from", Diagnostic.strong(channel.name));

        // An unsecured session created for an inbound message must not outlive that message unless a protocol handler
        // adopts it (PASE and CASE do), otherwise any peer can grow the session table without authenticating
        const inbound: { unsecuredSession?: UnsecuredSession } = {};
        try {
            await this.#receiveMessage(channel, messageBytes, inbound, lifetime);
        } finally {
            const session = inbound.unsecuredSession;
            if (session !== undefined && !session.isClosed && !session.isClosing && !session.hasActiveExchanges) {
                // The transport owns the channel of an inbound message, so release it instead of closing it
                await session.detachChannel()?.release();
                await session.initiateClose();
            }
        }
    }

    /**
     * Log a failure that the content of a received datagram caused at debug level, because any sender can cause it
     * repeatedly.  Rethrow any other error, so it reaches the error log.
     */
    #dropPeerDataFailure(error: unknown, ...context: unknown[]) {
        if (!isCausedByPeerData(error)) {
            throw error;
        }
        this.#logger.debug(...context, error.message);
    }

    /**
     * Report once per session that a message failed authentication, because a peer that keeps sending such messages
     * does not get through.  Every occurrence is logged at debug level as well.
     */
    #noticeAuthenticationFailure(session: Session) {
        if (this.#sessionsWithAuthenticationFailure.has(session)) {
            return;
        }
        this.#sessionsWithAuthenticationFailure.add(session);
        this.#logger.notice(session.via, "Received a message that fails authentication with the session key");
    }

    async #receiveMessage(
        channel: Channel<Bytes>,
        messageBytes: Bytes,
        inbound: { unsecuredSession?: UnsecuredSession },
        lifetime: Lifetime,
    ) {
        let packet;
        try {
            packet = MessageCodec.decodePacket(messageBytes);
        } catch (error) {
            this.#dropPeerDataFailure(error, `Dropping malformed datagram from ${channel.name}:`);
            return;
        }
        const bytes = Bytes.of(messageBytes);
        const aad = bytes.slice(0, bytes.length - packet.applicationPayload.byteLength); // Header+Extensions

        let isDuplicate: boolean;
        let session: Session | undefined;
        let message: DecodedMessage | undefined;
        if (packet.header.sessionType === SessionType.Unicast) {
            if (packet.header.sessionId === UNICAST_UNSECURE_SESSION_ID) {
                if (this.#isClosing) return;

                // Responses include our ephemeral initiator nodeId as destNodeId and no sourceNodeId
                // Initiating requests include their sourceNodeId but no destNodeId
                const initiatorNodeId = packet.header.destNodeId ?? packet.header.sourceNodeId;
                if (initiatorNodeId === undefined) {
                    throw new InternalError("Unsecured message without node id although the packet decoder refuses it");
                }
                session = this.#sessions.getUnsecuredSession(initiatorNodeId);
                if (session === undefined) {
                    if (packet.header.destNodeId !== undefined) {
                        // This is a response to a session that no longer exists (e.g. a late retransmission
                        // after PASE completed).  Drop it rather than creating an orphan session.
                        this.#logger.debug(
                            Diagnostic.via(
                                `${packet.header.sourceNodeId === undefined ? "" : `@${hex(packet.header.sourceNodeId)}:`}${Mark.SESSION}unsecured#${hex.word(initiatorNodeId)}`,
                            ),
                            `Ignoring unsecured response for unknown session`,
                        );
                        return;
                    }
                    session = inbound.unsecuredSession = this.#sessions.createUnsecuredSession({
                        channel,
                        initiatorNodeId,
                    });
                }
            } else {
                session = this.#sessions.getSession(packet.header.sessionId);
            }

            if (session === undefined) {
                this.#logger.debug(
                    Diagnostic.via(
                        `@${packet.header.sourceNodeId === undefined ? "?" : hex(packet.header.sourceNodeId)}:?${Mark.SESSION}${Session.idStrOf(packet)}`,
                    ),
                    "Ignoring message for unknown session",
                );
                return;
            }

            try {
                message = session.decode(packet, aad);
            } catch (error) {
                this.#dropPeerDataFailure(error, session.via, "Dropping message that does not decode:");
                if (error instanceof CryptoDecryptError) {
                    this.#noticeAuthenticationFailure(session);
                }
                return;
            }

            try {
                session.updateMessageCounter(message.packetHeader.messageId);
                isDuplicate = false;
            } catch (e) {
                DuplicateMessageError.accept(e);
                isDuplicate = true;
            }

            // Every decoded message proves the peer is active, also a duplicate or one that no exchange accepts; the
            // CHIP SDK marks the session active before it drops a duplicate.
            session.notifyActivity(true);
        } else if (packet.header.sessionType === SessionType.Group) {
            if (this.#isClosing) return;

            const sourceIp = isIpNetworkChannel(channel) ? channel.networkAddress.ip : undefined;
            const received = this.#sessions.groupSessionFromPacket(packet, aad, sourceIp);
            if (received === undefined) {
                return;
            }
            const { session: groupSession, message: groupMessage, key, sourceNodeId, groupId } = received;
            session = groupSession;
            message = { ...groupMessage, receivedFrom: sourceIp };

            try {
                session.updateMessageCounter(message.packetHeader.messageId, sourceNodeId, key);
                isDuplicate = false;
            } catch (e) {
                DuplicateMessageError.accept(e);
                isDuplicate = true;
                // Report replay for Groupcast testing — observable is a no-op without listeners.
                this.#sessions.emitGroupMessage({
                    kind: "authenticated",
                    result: Groupcast.GroupcastTestResult.MessageReplay,
                    fabric: groupSession.fabric,
                    groupId,
                    sourceIp,
                });
            }
        } else {
            throw new MatterFlowError(`Unsupported session type: ${packet.header.sessionType}`);
        }

        const messageId = message.packetHeader.messageId;

        const exchangeIndex = message.payloadHeader.isInitiatorMessage
            ? message.payloadHeader.exchangeId
            : message.payloadHeader.exchangeId | 0x10000;
        const exchange = this.#exchanges.get(session)?.get(exchangeIndex);

        const isStandaloneAck = SecureMessageType.isStandaloneAck(
            message.payloadHeader.protocolId,
            message.payloadHeader.messageType,
        );
        const messageDiagnostics = Diagnostic.dict({
            message: hex.fixed(messageId, 8),
            protocol: message.payloadHeader.protocolId,
            exId: hex.word(message.payloadHeader.exchangeId),
            via: channel.name,
        });

        if (exchange !== undefined) {
            try {
                lifetime.details.exchange = exchange.idStr;
                if (exchange.considerClosed && !isStandaloneAck) {
                    this.#logger.debug(
                        exchange.via,
                        "Ignore",
                        Mark.INBOUND,
                        "message because exchange is closing",
                        messageDiagnostics,
                    );

                    try {
                        await exchange.sendStandaloneAckForMessage(message);
                    } finally {
                        // Ensure we close the exchange even if sending the ack failed
                        await exchange.close();
                    }
                    return;
                }

                await exchange.onMessageReceived(message, isDuplicate);
            } catch (error) {
                this.#handleIncomingMessageError("message", error, exchange, message);
            }
        } else {
            if (this.#isClosing) return;
            if (session.isClosing) {
                this.#logger.debug(`Declining new exchange because session ${Session.idStrOf(packet)} is closing`);
                return;
            }

            const protocolHandler = this.#protocols.get(message.payloadHeader.protocolId);

            const handlerSecurityMismatch =
                protocolHandler?.requiresSecureSession !== undefined &&
                protocolHandler.requiresSecureSession !== session.isSecure;
            // Having a "Secure Session" means it is encrypted in our internal working
            // TODO When adding Group sessions, we need to check how to adjust that handling
            if (handlerSecurityMismatch) {
                this.#logger.debug(
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
                    this.#logger.debug(
                        "Ignore",
                        Mark.INBOUND,
                        "unsolicited standalone ack message",
                        messageDiagnostics,
                    );
                    return;
                }

                const exchange = MessageExchange.fromInitialMessage(this.#messageExchangeContextFor(session), message);

                // When opening a new exchange, ensure we have the latest address in the channel, the new message wins
                // over potentially other known addresses.
                // We ignore "inter exchange" address changes for now, we can address this when needed
                // TODO Refactor this and move address to peer
                if (!(session instanceof UnsecuredSession) && !session.isClosed) {
                    session.channel.socket = channel;
                }

                lifetime.details.exchange = exchange.idStr;
                this.#addExchange(session, exchangeIndex, exchange);
                try {
                    await exchange.onMessageReceived(message);
                    await protocolHandler.onNewExchange(exchange, message);
                } catch (error) {
                    this.#handleIncomingMessageError("initial message", error, exchange, message);
                }
            } else if (message.payloadHeader.requiresAck) {
                const exchange = MessageExchange.fromInitialMessage(this.#messageExchangeContextFor(session), message);
                lifetime.details.exchange = exchange.idStr;
                this.#addExchange(session, exchangeIndex, exchange);

                try {
                    await exchange.sendStandaloneAckForMessage(message);
                    await exchange.close();
                    this.#logger.debug("Ignore", Mark.INBOUND, "unsolicited message", messageDiagnostics);
                } catch (error) {
                    this.#handleIncomingMessageError("unsolicited message", error, exchange, message);
                }
            } else {
                if (protocolHandler === undefined) {
                    this.#logger.debug(
                        "Ignore",
                        Mark.INBOUND,
                        "message for an unsupported protocol",
                        messageDiagnostics,
                    );
                    return;
                }
                if (isDuplicate) {
                    if (message.packetHeader.destGroupId === undefined) {
                        // Duplicate Non-Group messages are still interesting to log to know them
                        this.#logger.debug("Ignore", Mark.INBOUND, "duplicate message", messageDiagnostics);
                    }
                    return;
                }
                if (!isStandaloneAck) {
                    this.#logger.debug(
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

    #handleIncomingMessageError(what: string, error: unknown, exchange: MessageExchange, message: Message) {
        if (causedBy(error, ShutdownError)) {
            this.#logger.info(
                Message.via(exchange, message),
                `Rejected incoming ${what}:`,
                Diagnostic.errorMessage(asError(error)),
            );
            return;
        }

        this.#logger.warn(Message.via(exchange, message), "Unhandled error handling incoming message:", error);
    }

    #addExchange(session: Session, exchangeIndex: number, exchange: MessageExchange) {
        const exchanges = this.#exchangesOf(session);
        exchange.closed.once(() => {
            exchanges.delete(exchangeIndex);
            if (exchanges.size === 0) {
                this.#exchanges.delete(session);
            }
        });
        exchanges.set(exchangeIndex, exchange);

        // The spec recommends a maximum of 5 concurrent exchanges over a unicast session to avoid exhausting the
        // peer's message counter window; we allow MAXIMUM_CONCURRENT_OUTGOING_EXCHANGES_PER_SESSION as a practical
        // upper bound and evict the least-recently-active exchange once exceeded.  Each group session object counts on
        // its own.
        this.#cleanupSessionExchanges(session, exchanges);
    }

    /** The open exchanges of the session, by exchange index; creates the entry when the session has none yet. */
    #exchangesOf(session: Session) {
        let exchanges = this.#exchanges.get(session);
        if (exchanges === undefined) {
            exchanges = new Map();
            this.#exchanges.set(session, exchanges);
        }
        return exchanges;
    }

    #cleanupSessionExchanges(session: Session, exchanges: Map<number, MessageExchange>) {
        if (!session.isSecure) {
            // PASE/CASE exchanges are not relevant for this limit
            return;
        }
        const sessionExchanges = Array.from(exchanges.values()).filter(exchange => !exchange.considerClosed);
        if (sessionExchanges.length <= MAXIMUM_CONCURRENT_OUTGOING_EXCHANGES_PER_SESSION) {
            return;
        }
        // TODO: Adjust this logic into a Exchange creation queue instead of hard closing
        const exchangeToClose = sessionExchanges.reduce((leastRecentlyActive, exchange) =>
            exchange.lastActive < leastRecentlyActive.lastActive ? exchange : leastRecentlyActive,
        );
        this.#logger.debug(
            exchangeToClose.via,
            `Closing least-recently-active exchange for session because of too many concurrent exchanges. Ensure to not send that many parallel messages to one peer.`,
        );
        this.#workers.add(exchangeToClose.close());
    }

    calculateMaximumPeerResponseTimeMsFor(
        session: Session,
        expectedProcessingTime = MRP.DEFAULT_EXPECTED_PROCESSING_TIME,
        includeMaximumSendingTime = false,
    ) {
        return session.channel.calculateMaximumPeerResponseTime(
            session.parameters,
            this.#sessions.sessionParameters,
            expectedProcessingTime,
            includeMaximumSendingTime,
            this.#sessions.localAdditionalMrpDelay,
            this.#sessions.localFixedMrpBackoff,
        );
    }

    #messageExchangeContextFor(session: Session): MessageExchangeContext {
        const createdAt = Time.nowUs;
        return {
            session,
            localSessionParameters: this.#sessions.sessionParameters,
            localAdditionalMrpDelay: this.#sessions.localAdditionalMrpDelay,
            localFixedMrpBackoff: this.#sessions.localFixedMrpBackoff,

            peerLost: async (exchange: MessageExchange, cause: Error) => {
                if (!(session instanceof NodeSession)) {
                    return;
                }

                // If not connected to a commissioned peer, report peer loss to the session only
                if (
                    session.peerAddress.fabricIndex === FabricIndex.NO_FABRIC ||
                    session.peerAddress.nodeId === NodeId.UNSPECIFIED_NODE_ID
                ) {
                    await session.handlePeerLoss({
                        cause,
                        currentExchange: exchange,
                    });
                    return;
                }

                // Report peer loss to the session manager; this notifies all (relevant) sessions for the peer
                await this.#sessions.handlePeerLoss(session.peerAddress, {
                    cause,
                    asOf: createdAt,
                    currentExchange: exchange,
                });
            },

            retry: number => this.#sessions.retry.emit(session, number),
        };
    }

    #addTransport(netInterface: Transport) {
        const udpInterface = netInterface instanceof UdpTransport;
        this.#listeners.set(
            netInterface,
            netInterface.onData((socket, data) => {
                if (udpInterface && data.byteLength > socket.maxPayloadSize) {
                    this.#logger.debug(
                        `Received UDP message from ${socket.name} with size ${data.byteLength}, which is larger than the maximum allowed size of ${socket.maxPayloadSize}`,
                    );
                }

                this.#workers.add(this.#onMessage(socket, data));
            }),
        );

        // For connection-oriented transports (TCP), subscribe to disconnect events so we can
        // evict all sessions bound to a dropped connection.
        if (isConnectionOrientedTransport(netInterface)) {
            this.#disconnectListeners.set(
                netInterface,
                netInterface.onDisconnect!(channel => {
                    this.#workers.add(this.#onConnectionDisconnect(channel));
                }),
            );
        }
    }

    #deleteTransport(netInterface: Transport) {
        const listener = this.#listeners.get(netInterface);
        if (listener === undefined) {
            return;
        }
        this.#listeners.delete(netInterface);
        this.#workers.add(listener.close());

        const disconnectListener = this.#disconnectListeners.get(netInterface);
        if (disconnectListener !== undefined) {
            this.#disconnectListeners.delete(netInterface);
            this.#workers.add(disconnectListener.close());
        }
    }

    /**
     * Handle a TCP connection drop by evicting all sessions bound to that connection.
     *
     * Mimics CHIP SDK behavior: when a TCP connection drops, all sessions on that connection
     * are evicted and all their exchanges are closed.
     */
    /** Find all active sessions whose underlying transport channel matches by identity. */
    #sessionsOnChannel(channel: Channel<Bytes>): Array<Session> {
        const result = new Array<Session>();

        const check = (session: Session) => {
            if (session.isClosed) return;
            if (session.channel.transportChannel === channel) {
                result.push(session);
            }
        };

        for (const session of this.#sessions.sessions) check(session);
        for (const session of this.#sessions.unsecuredSessions.values()) check(session);

        return result;
    }

    async #onConnectionDisconnect(channel: Channel<Bytes>) {
        this.#logger.info("TCP connection dropped, evicting bound sessions:", channel.name);

        // Mimics CHIP SDK behavior: evict all sessions when TCP connection drops
        for (const session of this.#sessionsOnChannel(channel)) {
            this.#logger.debug("Evicting session due to TCP disconnect:", session.via);

            // An in-flight subscription update has to be settled before initiateForceClose's
            // subscription teardown awaits it; on a dead connection only closing its exchange settles
            // it, and nothing else would for the peer's full response time
            for (const exchange of [...session.exchanges]) {
                await exchange.close(new TransportClosedError("TCP connection dropped"));
            }

            await session.initiateForceClose({ cause: new TransportClosedError("TCP connection dropped") });
        }
    }

    /**
     * When a session over TCP is removed, check if it was the last session referencing that
     * TCP connection. If so, close the connection.
     *
     * Mimics CHIP SDK behavior: close TCP connection when last session is removed.
     */
    async #closeTcpChannelIfLastSession(tcpChannel: Channel<Bytes>) {
        if (this.#sessionsOnChannel(tcpChannel).length > 0) {
            return;
        }

        this.#logger.info("Last session on TCP connection removed, closing connection:", tcpChannel.name);
        await tcpChannel.close();
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

        // When a session over TCP is removed, check if the TCP connection should be closed
        try {
            const underlyingChannel = session.channel.transportChannel;
            if (underlyingChannel.type === ChannelType.TCP) {
                this.#workers.add(this.#closeTcpChannelIfLastSession(underlyingChannel));
            }
        } catch {
            // Session channel may already be detached/closed, ignore
        }
    }

    async #sendCloseSession(session: NodeSession) {
        await using exchange = this.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID);
        this.#logger.debug(exchange.via, "Closing session");
        try {
            const messenger = new SecureChannelMessenger(exchange);
            await messenger.sendCloseSession();
            await messenger.close();
        } catch (error) {
            this.#logger.warn(exchange.via, "Error closing session:", error);
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
