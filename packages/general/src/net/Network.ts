/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time, Timer } from "#time/Time.js";
import { Seconds } from "#time/TimeUnit.js";
import { AsyncObservable } from "#util/Observable.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { Logger } from "../log/Logger.js";
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

/**
 * Thrown when an operation needs a transport connection that is already closed, and when a session or
 * exchange ends because the connection beneath it went.
 *
 * Deliberately **not** a {@link NetworkError} and not a `TransientPeerCommunicationError`. An
 * in-flight exchange failing with either of those reports the peer as *lost*, which closes every
 * session with that peer regardless of transport, and a `NetworkError` additionally flags the peer
 * for mDNS rediscovery. A connection this node has already closed, or one that dropped while the
 * sessions bound to it are being torn down, establishes none of that: the peer may still be
 * reachable, and the sessions to invalidate are the ones bound to that connection.
 *
 * @see {@link MatterSpecification.v161.Core} § 4.15.1
 */
export class TransportClosedError extends MatterError {}

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

const logger = Logger.get("Network");

export const STANDARD_MATTER_PORT = 5540;

/**
 * How often {@link Network.interfacesChanged} compares the interfaces while observed: half the 120 s TTL of mDNS
 * address records, so peers hold an old address for at most this interval plus one TTL.
 */
export const INTERFACE_CHECK_INTERVAL = Seconds(60);

/**
 * @see {@link MatterSpecification.v161.Core} § 11.12.5.4
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
    /**
     * Emits the sorted names of the interfaces that were added, removed, or whose MAC or address set changed since
     * the previous check.  The order of addresses and duplicates do not count as a change.
     *
     * While at least one observant observer is registered, the interfaces are checked every
     * {@link INTERFACE_CHECK_INTERVAL}; the first check after observation starts only records the current state.
     * {@link checkInterfaces} awaits the observers, so they never run concurrently.  After {@link close} the periodic
     * check does not start again.
     */
    readonly interfacesChanged = AsyncObservable<[names: string[]]>();

    #snapshot?: Map<string, string>;
    #checking?: Promise<void>;
    #isClosed = false;
    readonly #checkTimer: Timer;

    constructor() {
        this.#checkTimer = Time.getPeriodicTimer("Network interface check", INTERFACE_CHECK_INTERVAL, () =>
            this.checkInterfaces().catch(logCheckFailure),
        );
        this.#checkTimer.utility = true;
        this.interfacesChanged.observed.on(isObserved => {
            if (isObserved && !this.#isClosed) {
                this.#checkTimer.start();
                this.checkInterfaces().catch(logCheckFailure);
            } else {
                this.#checkTimer.stop();
                this.#snapshot = undefined;
            }
        });
    }

    /**
     * Compare the interfaces with the previous check and emit {@link interfacesChanged} if they differ.  Settles once
     * the observers ran.  A call while a check runs returns that check.  A failed listing keeps the previous state
     * and rejects.
     *
     * Use this when the platform or the application learns of a change before the next periodic check.
     */
    checkInterfaces(): Promise<void> {
        if (this.#checking === undefined) {
            this.#checking = this.#check().finally(() => (this.#checking = undefined));
        }
        return this.#checking;
    }

    async #check() {
        const snapshot = new Map<string, string>();
        for (const { name } of await this.getNetInterfaces()) {
            const details = await this.getIpMac(name);
            if (details !== undefined) {
                snapshot.set(name, describeDetails(details));
            }
        }

        // A snapshot taken while nobody observes would turn later changes into a delayed emit after observation starts
        if (!this.interfacesChanged.isObserved) {
            this.#snapshot = undefined;
            return;
        }
        const previous = this.#snapshot;
        this.#snapshot = snapshot;
        if (previous === undefined) {
            return;
        }

        const changed = [...new Set([...previous.keys(), ...snapshot.keys()])]
            .filter(name => previous.get(name) !== snapshot.get(name))
            .sort();
        if (changed.length) {
            await this.interfacesChanged.emit(changed);
        }
    }

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
        this.#isClosed = true;
        this.#checkTimer.stop();
    }
}

function logCheckFailure(error: unknown) {
    logger.debug("Cannot check the network interfaces", error);
}

function describeDetails({ mac, ipV4, ipV6 }: NetworkInterfaceDetails) {
    const sorted = (addresses: string[]) => [...new Set(addresses)].sort().join(",");
    return `${mac}|${sorted(ipV4)}|${sorted(ipV6)}`;
}
