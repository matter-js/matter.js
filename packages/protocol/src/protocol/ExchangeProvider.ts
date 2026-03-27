/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { InteractionSettings } from "#action/InteractionSettings.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { NodeSession } from "#session/NodeSession.js";
import { SecureSession } from "#session/SecureSession.js";
import { ChannelType, Duration, ServerAddressUdp } from "@matter/general";
import { INTERACTION_PROTOCOL_ID } from "@matter/types";
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
     * By default, matter.js selects a network based on the node's physical properties.  Use "unlimited" to disable
     * rate limiting.
     */
    network?: string;

    /**
     * Optional address override for the exchange.  When set, messages are sent to this address
     * instead of the session's default peer address.
     */
    addressOverride?: ServerAddressUdp;

    /**
     * When true, requires an existing session and does not attempt to establish a new one.
     * The exchange creation fails if no active session is available.
     */
    requireExistingSession?: boolean;

    /** Required transport type for this exchange. If set, only sessions of this transport type are used. */
    requiredTransport?: ChannelType;
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
