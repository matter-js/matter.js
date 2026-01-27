/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { ServerAddressUdp } from "#net/ServerAddress.js";
import { isObject } from "#util/Type.js";
import { Observable } from "#util/index.js";

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
    networkAddress: ServerAddressUdp;

    networkAddressChanged: Observable<[ServerAddressUdp]>;
}

export function isIpNetworkChannel<T>(channel?: Channel<T>): channel is IpNetworkChannel<T> {
    return isObject((channel as IpNetworkChannel<T> | undefined)?.networkAddress);
}

export function sameIpNetworkChannel<T>(channel1: IpNetworkChannel<T>, channel2: IpNetworkChannel<T>) {
    const { networkAddress: addr1 } = channel1;
    const { networkAddress: addr2 } = channel2;
    return addr1.type === addr2.type && addr1.ip === addr2.ip && addr1.port === addr2.port;
}
