/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Lifetime, MaybePromise } from "#util/index.js";
import { ChannelType } from "../Channel.js";
import { ConnectionlessTransport } from "../ConnectionlessTransport.js";

/** @see {@link MatterSpecification.v12.Core} § 4.4.4 */
export const MAX_UDP_MESSAGE_SIZE = 1280 - 48; // 48 bytes IP and UDP header size for IPv6

/**
 * UDP socket address type.
 *
 * "udp4" and "udp6" are IPv4 and IPv6 exclusively.  "udp" binds both IPv4 and IPv6 addresses.
 */
export type UdpSocketType = "udp" | "udp4" | "udp6";

export interface UdpChannelOptions {
    /**
     * UDP channel type.  "udp4" and "udp6" mean IPv4 and IPv6 respectively.  "udp" is dual-mode IPv4/IPv6.
     */
    type: UdpSocketType;

    /**
     * The port to listen on.  undefined or 0 directs the operating system to select an open port.
     */
    listeningPort?: number;

    /**
     * The address to listen on, either a hostname or IP address in correct format based on {@link type}.
     *
     * undefined directs the operating system to listen on all addresses on the port.  "0.0.0.0" is wildcard IPv4 and
     * "::" is wildcard IPv6.
     *
     * "0.0.0.0" is not allowed if {@link type} is "udp".
     */
    listeningAddress?: string;

    /**
     * Specifies a specific network interface.
     *
     * This is required for multicast sockets.
     */
    netInterface?: string;

    /**
     * Owning lifetime of the channel.
     */
    lifetime?: Lifetime;

    /**
     * Address+port pairs are normally may normally only be opened by a single socket.  This allows shared access to a
     * port.
     */
    reuseAddress?: boolean;
}

export interface UdpChannel {
    maxPayloadSize: number;
    addMembership(address: string): MaybePromise<void>;
    dropMembership(address: string): MaybePromise<void>;
    onData(listener: UdpChannel.Callback): ConnectionlessTransport.Listener;
    send(host: string, port: number, data: Bytes): Promise<void>;
    close(): Promise<void>;
    get port(): number;
    supports(type: ChannelType, address?: string): boolean;
}

export namespace UdpChannel {
    export interface Callback {
        (netInterface: string | undefined, peerAddress: string, peerPort: number, data: Bytes): void;
    }
}
