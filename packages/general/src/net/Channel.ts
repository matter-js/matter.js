/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ServerAddressIp, ServerAddressUdp } from "#net/ServerAddress.js";
import type { Transport } from "#net/Transport.js";
import { Bytes } from "#util/Bytes.js";
import { Observable } from "#util/index.js";
import { isObject } from "#util/Type.js";

export enum ChannelType {
    UDP = "udp",
    BLE = "ble",
    TCP = "tcp",
}

export interface Channel<T> {
    /** Maximum Payload size for this channel */
    maxPayloadSize: number;

    /** Is the transport Reliable? UDP is not, TCP and BTP are. */
    isReliable: boolean;

    /** Does the channel support large messages? */
    supportsLargeMessages: boolean;

    /** Channel name */
    name: string;

    type: ChannelType;

    /** Method to send data to the remote endpoint */
    send(data: T): Promise<void>;

    /** Method to close the channel */
    close(): Promise<void>;
}

export interface IpNetworkChannel<T> extends Channel<T> {
    networkAddress: ServerAddressIp;
    networkAddressChanged: Observable<[ServerAddressIp]>;

    /** Send data to the remote endpoint */
    send(data: T): Promise<void>;
}

/** UDP-specific channel with per-send address override capability. */
export interface UdpNetworkChannel<T> extends IpNetworkChannel<T> {
    networkAddress: ServerAddressUdp;
    networkAddressChanged: Observable<[ServerAddressUdp]>;

    /** Send data, optionally overriding the destination address for this single send. */
    send(data: T, addressOverride?: ServerAddressUdp): Promise<void>;
}

/**
 * Stream-oriented channel with a fixed peer (TCP, BLE/BTP).
 *
 * Both TCP and BLE channels are inherently reliable and have a connection lifecycle.
 * Incoming messages are delivered as an async iterable; outgoing messages via send().
 */
export interface ConnectedChannel extends Channel<Bytes>, AsyncIterable<Bytes> {
    readonly isReliable: true;
    readonly supportsLargeMessages: boolean;
    readonly type: ChannelType;

    /** Send a complete Matter message to the peer. */
    send(data: Bytes): Promise<void>;

    /** Close the connection. */
    close(): Promise<void>;

    /** Register a listener for connection close/disconnect. */
    onClose(listener: () => void): Transport.Listener;
}

/**
 * Type guard for connected (stream-oriented) channels.
 */
export function isConnectedChannel(channel?: Channel<unknown>): channel is ConnectedChannel {
    return channel !== undefined && channel.isReliable && typeof (channel as ConnectedChannel).onClose === "function";
}

/**
 * Returns true (and guards types) if the channel is an IP channel
 */
export function isIpNetworkChannel<T>(channel?: Channel<T>): channel is IpNetworkChannel<T> {
    return isObject((channel as IpNetworkChannel<T> | undefined)?.networkAddress);
}

/**
 * Returns true if the channel is a UDP network channel (supports address override).
 */
export function isUdpNetworkChannel<T>(channel?: Channel<T>): channel is UdpNetworkChannel<T> {
    return isIpNetworkChannel(channel) && channel.type === ChannelType.UDP;
}

/**
 * Checks if two IPNetworkChannels are referencing the same address.
 */
export function sameIpNetworkChannel<T>(channel1: IpNetworkChannel<T>, channel2: IpNetworkChannel<T>) {
    const { networkAddress: addr1 } = channel1;
    const { networkAddress: addr2 } = channel2;
    return addr1.ip === addr2.ip && addr1.port === addr2.port;
}
