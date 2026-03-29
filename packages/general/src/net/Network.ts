/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "../MatterError.js";
import type { MaybePromise } from "../util/Promises.js";
import type { TcpServer, TcpServerOptions, TcpSocket } from "./tcp/TcpSocket.js";
import type { UdpChannel, UdpChannelOptions } from "./udp/UdpChannel.js";

export class NetworkError extends MatterError {}

export class NoAddressAvailableError extends NetworkError {}

export class BindError extends NetworkError {}

export class AddressInUseError extends BindError {}

export class AddressUnreachableError extends NetworkError {}

export class NetworkUnreachableError extends NetworkError {}

export const STANDARD_MATTER_PORT = 5540;

/**
 * @see {@link MatterSpecification.v11.Core} § 11.11.4.4
 * Duplicated from the GeneralDiagnostics cluster to avoid circular dependencies.
 */
export enum InterfaceType {
    /**
     * Indicates an interface of an unspecified type.
     */
    Unspecified = 0,

    /**
     * Indicates a Wi-Fi interface.
     */
    WiFi = 1,

    /**
     * Indicates a Ethernet interface.
     */
    Ethernet = 2,

    /**
     * Indicates a Cellular interface.
     */
    Cellular = 3,

    /**
     * Indicates a Thread interface.
     */
    Thread = 4,
}

export type NetworkInterface = {
    name: string;
    type?: InterfaceType;
};

export type NetworkInterfaceDetails = {
    mac: string;
    ipV4: string[];
    ipV6: string[];
};

export type NetworkInterfaceDetailed = NetworkInterface & NetworkInterfaceDetails;
export abstract class Network {
    abstract getNetInterfaces(configuration?: NetworkInterface[]): MaybePromise<NetworkInterface[]>;
    abstract getIpMac(netInterface: string): MaybePromise<NetworkInterfaceDetails | undefined>;
    abstract createUdpChannel(options: UdpChannelOptions): Promise<UdpChannel>;

    /** Create a TCP server socket. Override in platform implementations that support TCP. */
    createTcpServer(_options: TcpServerOptions): Promise<TcpServer> {
        throw new NetworkError("TCP server not supported on this platform");
    }

    /** Connect to a remote TCP endpoint. Override in platform implementations that support TCP. */
    connectTcp(_host: string, _port: number, _options?: { timeout?: number }): Promise<TcpSocket> {
        throw new NetworkError("TCP client not supported on this platform");
    }

    async close() {
        // Nothing to do
    }
}
