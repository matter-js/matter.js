/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedTransportsSchema } from "#common/SupportedTransportsBitmap.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ExchangeProvider, NewExchangeOptions } from "#protocol/ExchangeProvider.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import { MRP } from "#protocol/MRP.js";
import { ChannelType, Duration, InternalError } from "@matter/general";
import { INTERACTION_PROTOCOL_ID } from "@matter/types";
import { Peer } from "./Peer.js";
import { PeerConnection } from "./PeerConnection.js";

/**
 * Resolve the ordered list of transports to attempt for a peer.
 *
 * - `requiredTransport` (e.g. Large Message Quality) is a hard constraint: only that transport.
 * - Otherwise, if TCP is preferred and the peer advertises TCP server support, return [TCP, UDP].
 * - Otherwise return undefined (default UDP, no constraint).
 */
function resolveTransports(peer: Peer, requiredTransport: ChannelType | undefined): ChannelType[] | undefined {
    if (requiredTransport !== undefined) {
        return [requiredTransport];
    }
    if (peer.transportPreference !== ChannelType.TCP) {
        return undefined;
    }
    const T = peer.descriptor.discoveryData?.T;
    if (typeof T !== "number") {
        return undefined;
    }
    return SupportedTransportsSchema.decode(T).tcpServer ? [ChannelType.TCP, ChannelType.UDP] : undefined;
}

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

    /**
     * The transport type of the current session. Returns the actual transport (TCP/UDP) of the
     * newest active session, or UDP as default when no session is active.
     */
    get channelType() {
        const session = this.#peer.newestSession();
        if (session && !session.isClosed) {
            return session.channel.transportChannel.type;
        }
        return ChannelType.UDP;
    }

    override async connect(options?: NewExchangeOptions): Promise<void> {
        const transport = resolveTransports(this.#peer, options?.requiredTransport);

        await this.#peer.connect({
            abort: options?.abort,
            network: options?.network,
            connectionTimeout: options?.connectionTimeout,
            transport,
        });
    }

    override async initiateExchange(options?: NewExchangeOptions): Promise<MessageExchange> {
        const abort = options?.abort;
        const isGroup = PeerAddress.isGroup(this.#peer.address);

        while (true) {
            if (!isGroup && !options?.requireExistingSession) {
                // Connections grab their own network slot so connect before getting our own.
                // Probes skip connect because they verify liveness of the current session — calling
                // connect would establish a new session if the current one is broken, defeating the
                // purpose of a lightweight reachability check.
                await this.connect(options);
                abort?.throwIfAborted();
            }

            const network = this.#context.networks.select(this.#peer, options?.network);
            const slot = await network.semaphore.obtainSlot(abort);

            try {
                abort?.throwIfAborted();

                let session;
                if (isGroup) {
                    session = await this.#context.sessions.groupSessionForAddress(
                        this.#peer.address,
                        this.#context.exchanges,
                    );
                } else {
                    const transports = resolveTransports(this.#peer, options?.requiredTransport);
                    if (transports === undefined) {
                        session = this.#peer.newestSession();
                    } else {
                        for (const t of transports) {
                            session = this.#peer.newestSession(t);
                            if (session) break;
                        }
                    }
                }
                if (session === undefined) {
                    if (options?.requireExistingSession) {
                        // Slot will be closed when error is caught
                        throw new InternalError("No existing session available for probe");
                    }
                    // We had a session before getting the slot, but it was closed. Restart
                    slot.close();
                    continue;
                }

                const exchange = PeerConnection.createExchange(
                    this.#peer,
                    this.#context.exchanges,
                    session,
                    network,
                    options?.protocol ?? INTERACTION_PROTOCOL_ID,
                    options?.addressOverride,
                );

                exchange.closing.on(() => {
                    slot.close();
                });

                return exchange;
            } catch (e) {
                slot.close();
                throw e;
            }
        }
    }

    override maximumPeerResponseTime(expectedProcessingTime?: Duration, includeMaximumSendingTime?: boolean): Duration {
        return MRP.maxPeerResponseTimeOf({
            channelType: this.channelType,
            isPeerActive: true,
            localSessionParameters: this.#context.sessions.sessionParameters,
            peerSessionParameters: includeMaximumSendingTime ? this.#peer.sessionParameters : undefined,
            expectedProcessingTime,
        });
    }
}
