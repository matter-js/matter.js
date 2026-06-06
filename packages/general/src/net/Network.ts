/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "../log/Diagnostic.js";
import { MatterError } from "../MatterError.js";
import { repackErrorAs } from "../util/Error.js";
import type { MaybePromise } from "../util/Promises.js";
import type { TcpConnection, TcpListener, TcpListenerOptions } from "./tcp/TcpConnection.js";
import type { Transport } from "./Transport.js";
import type { UdpSocket, UdpSocketOptions } from "./udp/UdpSocket.js";

/** Options for {@link Network.connectTcp}. */
export interface TcpConnectOptions extends Transport.OpenChannelOptions {
    /** Per-call timeout in milliseconds. Defaults to TCP_CONNECTION_TIMEOUT_MS. */
    timeout?: number;
}

/**
 * Network errors typically reflect transient environmental conditions (unreachable host, interface down) rather than
 * defects, so they present as a compact message without a stack trace.
 */
export class NetworkError extends MatterError {
    get [Diagnostic.value]() {
        const { cause } = this;
        const causeMessage = cause instanceof Error ? cause.message : undefined;
        return Diagnostic.errorMessage({
            id: this.id,
            message: this.message,
            cause: causeMessage === this.message ? undefined : cause,
        });
    }
}

export class TcpDisconnectError extends NetworkError {}

export class NoAddressAvailableError extends NetworkError {}

export class BindError extends NetworkError {}

export class AddressInUseError extends BindError {}

export class AddressUnreachableError extends NetworkError {}

export class NetworkUnreachableError extends NetworkError {}

export function tcpErrorFrom(error: Error): NetworkError {
    const code = (error as { code?: string }).code;
    switch (code) {
        case "ECONNRESET":
        case "EPIPE":
        case "ECONNABORTED":
        case "ETIMEDOUT":
            return repackErrorAs(error, TcpDisconnectError);
        case "EADDRINUSE":
            return repackErrorAs(error, AddressInUseError);
        case "EHOSTUNREACH":
            return repackErrorAs(error, AddressUnreachableError);
        case "ENETUNREACH":
            return repackErrorAs(error, NetworkUnreachableError);
        default:
            return repackErrorAs(error, NetworkError);
    }
}

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
    abstract createUdpSocket(options: UdpSocketOptions): Promise<UdpSocket>;

    /** Create a TCP server socket. Override in platform implementations that support TCP. */
    createTcpListener(_options: TcpListenerOptions): Promise<TcpListener> {
        throw new NetworkError("TCP server not supported on this platform");
    }

    /** Connect to a remote TCP endpoint. Override in platform implementations that support TCP. */
    connectTcp(_host: string, _port: number, _options?: TcpConnectOptions): Promise<TcpConnection> {
        throw new NetworkError("TCP client not supported on this platform");
    }

    async close() {
        // Nothing to do
    }
}
