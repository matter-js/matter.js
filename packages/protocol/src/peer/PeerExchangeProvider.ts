/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExchangeProvider, NewExchangeOptions } from "#protocol/ExchangeProvider.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import { MRP } from "#protocol/MRP.js";
import { INTERACTION_PROTOCOL_ID } from "#types";
import { ChannelType, Duration } from "@matter/general";
import { Peer } from "./Peer.js";
import { PeerConnection } from "./PeerConnection.js";

/**
 * Produces {@link MessageExchange}s for a peer.
 */
export class PeerExchangeProvider extends ExchangeProvider {
    #peer: Peer;
    #context: PeerConnection.Context;

    constructor(peer: Peer, context: PeerConnection.Context) {
        super(context.exchanges);

        this.#peer = peer;
        this.#context = context;
    }

    get maxPathsPerInvoke() {
        return this.#peer.sessionParameters.maxPathsPerInvoke;
    }

    get peerAddress() {
        return this.#peer.address;
    }

    // TODO - TCP support
    readonly channelType = ChannelType.UDP;

    override async connect(options?: NewExchangeOptions): Promise<void> {
        await this.#peer.connect(options);
    }

    override async initiateExchange(options?: NewExchangeOptions): Promise<MessageExchange> {
        const abort = options?.abort;

        // Connections grab their own network slot so connect before obtaining our own
        const session = await this.#peer.connect(options);

        const network = this.#context.networks.select(this.#peer, options?.network);
        const slot = await network.semaphore.obtainSlot(abort);
        abort?.throwIfAborted();

        try {
            const exchange = PeerConnection.createExchange(
                this.#peer,
                this.#context.exchanges,
                session,
                options?.protocol ?? INTERACTION_PROTOCOL_ID,
            );

            exchange.closed.on(() => {
                slot.close();
            });

            return exchange;
        } catch (e) {
            slot.close();
            throw e;
        }
    }

    override maximumPeerResponseTime(expectedProcessingTime?: Duration): Duration {
        return MRP.maxPeerResponseTimeOf({
            channelType: this.channelType,
            isPeerActive: true,
            localSessionParameters: this.#context.sessions.sessionParameters,
            peerSessionParameters: this.#peer.sessionParameters,
            expectedProcessingTime,
        });
    }
}
