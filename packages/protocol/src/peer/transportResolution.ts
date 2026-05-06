/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedTransportsSchema } from "#common/SupportedTransportsBitmap.js";
import { ChannelType } from "@matter/general";

/**
 * Minimal structural view of a peer needed to resolve transports.
 *
 * Defined as a local interface (not `Pick<Peer, …>`) so the helper has no dependency on the full
 * `PeerDescriptor` shape, which keeps it trivially unit-testable with plain object fixtures.
 */
export interface TransportResolutionPeer {
    readonly transportPreference?: ChannelType;
    readonly descriptor: {
        readonly discoveryData?: { readonly T?: number };
    };
}

/**
 * Resolve the ordered list of transports to attempt when connecting to a peer.
 *
 * - `requiredTransport` (e.g. set by Large Message Quality) is a hard constraint: only that transport is returned.
 * - Otherwise, if the peer prefers TCP and advertises TCP server support in its discovery data, return
 *   `[TCP, UDP]` (TCP first, UDP fallback).
 * - Otherwise return `undefined` to indicate the default (UDP) transport with no constraint.
 */
export function resolveTransports(
    peer: TransportResolutionPeer,
    requiredTransport: ChannelType | undefined,
): ChannelType[] | undefined {
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
    const { tcpServer } = SupportedTransportsSchema.decode(T);
    if (!tcpServer) {
        return undefined;
    }
    return [ChannelType.TCP, ChannelType.UDP];
}
