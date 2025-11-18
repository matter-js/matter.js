/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Duration, Observable } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { DEFAULT_EXPECTED_PROCESSING_TIME } from "#protocol/MessageChannel.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { SecureSession } from "#session/SecureSession.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { INTERACTION_PROTOCOL_ID } from "#types";
import { SessionClosedError } from "./errors.js";

/**
 * Interface for obtaining an exchange with a specific peer.
 */
export abstract class ExchangeProvider {
    abstract readonly supportsReconnect: boolean;

    constructor(protected readonly exchangeManager: ExchangeManager) {}

    hasProtocolHandler(protocolId: number) {
        return this.exchangeManager.hasProtocolHandler(protocolId);
    }

    getProtocolHandler(protocolId: number) {
        return this.exchangeManager.getProtocolHandler(protocolId);
    }

    addProtocolHandler(handler: ProtocolHandler) {
        this.exchangeManager.addProtocolHandler(handler);
    }

    abstract maximumPeerResponseTime(expectedProcessingTime?: Duration): Duration;
    abstract initiateExchange(): Promise<MessageExchange>;
    abstract reconnectChannel(): Promise<boolean>;
    abstract session: Session;

    get channelType() {
        return this.session.channel.type;
    }
}

/**
 * Manages an exchange over an established channel.
 */
export class DedicatedChannelExchangeProvider extends ExchangeProvider {
    #session: SecureSession;
    readonly supportsReconnect = false;

    constructor(exchangeManager: ExchangeManager, session: SecureSession) {
        super(exchangeManager);
        this.#session = session;
    }

    async initiateExchange(): Promise<MessageExchange> {
        return this.exchangeManager.initiateExchangeForSession(this.#session, INTERACTION_PROTOCOL_ID);
    }

    async reconnectChannel() {
        return false;
    }

    get session() {
        return this.#session;
    }

    maximumPeerResponseTime(expectedProcessingTime = DEFAULT_EXPECTED_PROCESSING_TIME) {
        return this.exchangeManager.calculateMaximumPeerResponseTimeMsFor(this.#session, expectedProcessingTime);
    }
}

/**
 * Manages peer exchange that will reestablish automatically in the case of communication failure.
 */
export class ReconnectableExchangeProvider extends ExchangeProvider {
    readonly supportsReconnect = true;
    readonly #address: PeerAddress;
    readonly #reconnectChannelFunc: () => Promise<void>;
    readonly #channelUpdated = Observable<[void]>();

    constructor(
        exchangeManager: ExchangeManager,
        protected readonly sessions: SessionManager,
        address: PeerAddress,
        reconnectChannelFunc: () => Promise<void>,
    ) {
        super(exchangeManager);
        this.#address = address;
        this.#reconnectChannelFunc = reconnectChannelFunc;
        sessions.sessions.added.on(session => {
            if (session.peerAddress === this.#address) {
                this.#channelUpdated.emit();
            }
        });
    }

    get channelUpdated() {
        return this.#channelUpdated;
    }

    async initiateExchange(): Promise<MessageExchange> {
        if (!this.sessions.maybeSessionFor(this.#address)) {
            await this.reconnectChannel();
        }
        if (!this.sessions.maybeSessionFor(this.#address)) {
            throw new SessionClosedError("Channel not connected");
        }
        return this.exchangeManager.initiateExchange(this.#address, INTERACTION_PROTOCOL_ID);
    }

    async reconnectChannel() {
        if (this.#reconnectChannelFunc === undefined) return false;
        await this.#reconnectChannelFunc();
        return true;
    }

    get session() {
        return this.sessions.sessionFor(this.#address);
    }

    maximumPeerResponseTime(expectedProcessingTimeMs = DEFAULT_EXPECTED_PROCESSING_TIME) {
        return this.exchangeManager.calculateMaximumPeerResponseTimeMsFor(
            this.sessions.sessionFor(this.#address),
            expectedProcessingTimeMs,
        );
    }
}
