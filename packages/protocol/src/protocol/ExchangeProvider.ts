/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InteractionSettings } from "#action/InteractionSettings.js";
import { ChannelType, Duration } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { NodeSession } from "#session/NodeSession.js";
import { SecureSession } from "#session/SecureSession.js";
import { INTERACTION_PROTOCOL_ID } from "#types";
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
    constructor(protected readonly exchangeManager: ExchangeManager) {}

    abstract maximumPeerResponseTime(expectedProcessingTime?: Duration, includeMaximumSendingTime?: boolean): Duration;
    abstract initiateExchange(options?: NewExchangeOptions): Promise<MessageExchange>;
    abstract readonly channelType: ChannelType;
    abstract readonly peerAddress?: PeerAddress;
    abstract readonly maxPathsPerInvoke?: number;

    /**
     * Ensure the peer is reachable without creating an exchange.
     *
     * The default implementation is a no-op (already connected).
     */
    async connect(_options?: NewExchangeOptions): Promise<void> {}
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
