/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InteractionSettings } from "#action/InteractionSettings.js";
import { ChannelType, Diagnostic, Duration, Observable, Timestamp } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { NodeSession } from "#session/NodeSession.js";
import { SecureSession } from "#session/SecureSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { INTERACTION_PROTOCOL_ID } from "#types";
import { SessionClosedError } from "./errors.js";
import { MRP } from "./MRP.js";

/**
 * Message exchange configuration options.
 */
export interface NewExchangeOptions extends Omit<InteractionSettings, "transaction"> {
    /**
     * The protocol for the message exchange.
     *
     * Defaults to {@link INTERACTION_PROTOCOL_ID}.
     */
    protocol?: number;

    /**
     * The name of the logical {@link PeerNetwork}.
     *
     * By default matter.js selects a network based on the node's physical properties.  Use "unlimited" to disable
     * rate limiting.
     */
    network?: string;
}

/**
 * Interface for obtaining a message exchange with a specific peer.
 */
export abstract class ExchangeProvider {
    /** @deprecated */
    readonly supportsReconnect: boolean = false;

    constructor(protected readonly exchangeManager: ExchangeManager) {}

    abstract maximumPeerResponseTime(expectedProcessingTime?: Duration, includeMaximumSendingTime?: boolean): Duration;
    abstract initiateExchange(options?: NewExchangeOptions): Promise<MessageExchange>;
    abstract readonly channelType: ChannelType;
    abstract readonly peerAddress?: PeerAddress;
    abstract readonly maxPathsPerInvoke?: number;

    /** @deprecated */
    async reconnectChannel(_options: { asOf?: Timestamp; resetInitialState?: boolean }): Promise<boolean> {
        return false;
    }
}

/**
 * Manages an exchange over an established channel.
 */
export class DedicatedChannelExchangeProvider extends ExchangeProvider {
    #session: SecureSession;

    constructor(exchangeManager: ExchangeManager, session: SecureSession) {
        super(exchangeManager);
        this.#session = session;
    }

    get maxPathsPerInvoke() {
        return this.#session.parameters.maxPathsPerInvoke;
    }

    async initiateExchange(): Promise<MessageExchange> {
        return this.exchangeManager.initiateExchangeForSession(this.#session, INTERACTION_PROTOCOL_ID);
    }

    get channelType() {
        return this.#session.channel.channel.type;
    }

    get session() {
        return this.#session;
    }

    maximumPeerResponseTime(
        expectedProcessingTime = MRP.DEFAULT_EXPECTED_PROCESSING_TIME,
        includeMaximumSendingTime?: boolean,
    ) {
        return this.exchangeManager.calculateMaximumPeerResponseTimeMsFor(
            this.#session,
            expectedProcessingTime,
            includeMaximumSendingTime,
        );
    }

    get peerAddress() {
        if (NodeSession.is(this.#session)) {
            return this.#session.peerAddress;
        }
    }
}

/**
 * Manages peer exchange that will reestablish automatically in the case of communication failure.
 *
 * @deprecated
 */
export class ReconnectableExchangeProvider extends ExchangeProvider {
    override readonly supportsReconnect = true;
    readonly #address: PeerAddress;
    readonly #reconnectChannelFunc: (options?: { asOf?: Timestamp; resetInitialState?: boolean }) => Promise<void>;
    readonly #channelUpdated = Observable<[void]>();

    constructor(
        exchangeManager: ExchangeManager,
        protected readonly sessions: SessionManager,
        address: PeerAddress,
        reconnectChannelFunc: (options?: { asOf?: Timestamp; resetInitialState?: boolean }) => Promise<void>,
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

    get maxPathsPerInvoke() {
        return this.sessions.maybeSessionFor(this.#address)?.parameters.maxPathsPerInvoke;
    }

    async initiateExchange(options?: NewExchangeOptions): Promise<MessageExchange> {
        if (!this.sessions.maybeSessionFor(this.#address)) {
            using _connecting = this.sessions.construction.join(
                "connecting to",
                Diagnostic.strong(this.#address.toString()),
            );

            await this.reconnectChannel();
        }
        if (!this.sessions.maybeSessionFor(this.#address)) {
            throw new SessionClosedError("Channel not connected");
        }
        return this.exchangeManager.initiateExchange(this.#address, options?.protocol ?? INTERACTION_PROTOCOL_ID);
    }

    override async reconnectChannel(options: { asOf?: Timestamp; resetInitialState?: boolean } = {}) {
        if (this.#reconnectChannelFunc === undefined) {
            return false;
        }
        await this.#reconnectChannelFunc(options);
        return true;
    }

    readonly channelType = ChannelType.UDP;

    get peerAddress() {
        return this.#address;
    }

    maximumPeerResponseTime(
        expectedProcessingTime = MRP.DEFAULT_EXPECTED_PROCESSING_TIME,
        includeMaximumSendingTime?: boolean,
    ) {
        return this.exchangeManager.calculateMaximumPeerResponseTimeMsFor(
            this.sessions.sessionFor(this.#address),
            expectedProcessingTime,
            includeMaximumSendingTime,
        );
    }
}
