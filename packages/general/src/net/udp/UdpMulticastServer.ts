/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError } from "#MatterError.js";
import { Minutes } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
import { Lifetime } from "#util/Lifetime.js";
import { Logger } from "../../log/Logger.js";
import { AsyncCache } from "../../util/Cache.js";
import { asError } from "../../util/Error.js";
import { isIPv4 } from "../../util/Ip.js";
import { Network, NetworkError, NoAddressAvailableError } from "../Network.js";
import { UdpSocket } from "./UdpSocket.js";

const logger = Logger.get("UdpMulticastServer");

export interface UdpMulticastServerOptions {
    network: Network;
    listeningPort: number;
    broadcastAddressIpv6: string;
    broadcastAddressIpv4?: string;
    netInterface?: string;
    lifetime?: Lifetime.Owner;
}

export class UdpMulticastServer {
    #lifetime: Lifetime;
    readonly network: Network;
    readonly netInterface: string | undefined;
    readonly #broadcastAddressIpv4: string | undefined;
    readonly #broadcastAddressIpv6: string;
    readonly #broadcastPort: number;
    readonly #serverIpv4: UdpSocket | undefined;
    readonly #serverIpv6: UdpSocket;

    static async create({
        netInterface,
        broadcastAddressIpv4,
        broadcastAddressIpv6,
        listeningPort,
        network,
        lifetime: lifetimeOwner,
    }: UdpMulticastServerOptions) {
        const lifetime = (lifetimeOwner || Lifetime.process)?.join("multicast server");
        let ipv4UdpSocket: UdpSocket | undefined;
        let ipv6UdpSocket: UdpSocket | undefined;

        try {
            if (broadcastAddressIpv4 !== undefined) {
                try {
                    ipv4UdpSocket = await network.createUdpSocket({
                        lifetime,
                        type: "udp4",
                        netInterface,
                        listeningPort,
                        reuseAddress: true,
                    });
                    await ipv4UdpSocket.addMembership(broadcastAddressIpv4);
                } catch (error) {
                    NoAddressAvailableError.accept(error);
                    logger.info(
                        `IPv4 UDP channel not created because IPv4 is not available: ${asError(error).message}`,
                    );
                }
            }

            try {
                ipv6UdpSocket = await network.createUdpSocket({
                    lifetime,
                    type: "udp6",
                    netInterface,
                    listeningPort,
                    reuseAddress: true,
                });
                await ipv6UdpSocket.addMembership(broadcastAddressIpv6);
            } catch (error) {
                NoAddressAvailableError.accept(error);
                logger.info(`IPv6 UDP interface not created because IPv6 is not available, but required my Matter`);
                throw error;
            }

            return new UdpMulticastServer(
                lifetime,
                network,
                broadcastAddressIpv4,
                broadcastAddressIpv6,
                listeningPort,
                ipv4UdpSocket,
                ipv6UdpSocket,
                netInterface,
            );
        } catch (error) {
            try {
                await MatterAggregateError.allSettled(
                    [ipv4UdpSocket?.close(), ipv6UdpSocket?.close()],
                    "Error closing the sockets of a multicast server that failed to start",
                );
            } catch (closeError) {
                logger.warn(closeError);
            }
            lifetime[Symbol.dispose]();
            throw error;
        }
    }

    private readonly broadcastChannels: AsyncCache<UdpSocket>;

    private constructor(
        lifetime: Lifetime,
        network: Network,
        broadcastAddressIpv4: string | undefined,
        broadcastAddressIpv6: string,
        broadcastPort: number,
        serverIpv4: UdpSocket | undefined,
        serverIpv6: UdpSocket,
        netInterface: string | undefined,
    ) {
        this.#lifetime = lifetime;
        this.broadcastChannels = new AsyncCache<UdpSocket>(
            "UDP broadcast channel",
            lifetime,
            (netInterface, isIPv4) => this.createBroadcastChannel(netInterface, isIPv4),
            Minutes(5),
            async (_key, channel) => channel.close(),
        );
        this.network = network;
        this.#broadcastAddressIpv4 = broadcastAddressIpv4;
        this.#broadcastAddressIpv6 = broadcastAddressIpv6;
        this.#broadcastPort = broadcastPort;
        this.#serverIpv4 = serverIpv4;
        this.#serverIpv6 = serverIpv6;
        this.netInterface = netInterface;
    }

    get supportsIpv4() {
        return this.#serverIpv4 !== undefined;
    }

    onMessage(listener: (message: Bytes, peerAddress: string, netInterface: string) => void) {
        this.#serverIpv4?.onData((netInterface, peerAddress, _port, message) => {
            if (netInterface === undefined) {
                // Ignore Network packages not coming over any known interface
                return;
            }
            listener(message, peerAddress, netInterface);
        });
        this.#serverIpv6.onData((netInterface, peerAddress, _port, message) => {
            if (netInterface === undefined) {
                // Ignore Network packages not coming over any known interface
                return;
            }
            listener(message, peerAddress, netInterface);
        });
    }

    /**
     * Send {@link message} to the multicast group, or to {@link uniCastTarget} on {@link netInterface}.
     *
     * Without {@link netInterface} the message goes out on the interface the server is bound to, or on every
     * interface; a failed send there is logged at info level and the promise resolves.
     *
     * With {@link netInterface}, the promise reports the result for that interface:
     *
     * | Outcome on the interface                                      | Result                                       |
     * |---------------------------------------------------------------|----------------------------------------------|
     * | the datagram left on every address family it tried            | resolves to `"all"`                          |
     * | it left on some families and failed on others                 | resolves to `"some"` with the first failure  |
     * | every family it tried failed, or the unicast send failed      | rejects with {@link NetworkError}            |
     * | the interface reports no address at all                       | rejects with {@link NoAddressAvailableError} |
     * | it has addresses only of a family this server does not use    | resolves to `"none"`, nothing is sent        |
     * | the server closes                                             | resolves to what left                        |
     *
     * The first failure is the one that happened first; the address families are sent in parallel.  Failures the
     * result does not carry log at debug level.
     *
     * Without {@link netInterface} it resolves to undefined.  When the address lookup of an interface throws, the
     * promise rejects with a {@link MatterAggregateError} of that error; when listing the interfaces throws, it rejects
     * with that error.  A failed channel is closed, so the next send binds it again.
     */
    async send(
        message: Bytes,
        netInterface?: string,
        uniCastTarget?: string,
    ): Promise<UdpMulticastServer.Reach | undefined> {
        const result = netInterface === undefined ? undefined : new SendResult(netInterface);
        netInterface = netInterface ?? this.netInterface;

        // When we know the network interface and the unicast target, we can send unicast
        if (uniCastTarget !== undefined && netInterface !== undefined) {
            const isIPv4Target = isIPv4(uniCastTarget);
            await this.#sendOn(result, netInterface, isIPv4Target, uniCastTarget, message, true);
        } else {
            const netInterfaces =
                netInterface !== undefined ? [{ name: netInterface }] : await this.network.getNetInterfaces();
            await MatterAggregateError.allSettled(
                netInterfaces.map(async ({ name: netInterface }) => {
                    const { ipV4, ipV6 } = (await this.network.getIpMac(netInterface)) ?? {
                        mac: "",
                        ipV4: [],
                        ipV6: [],
                    };
                    if (!ipV4.length && !ipV6.length) {
                        result?.noAddress();
                        return;
                    }
                    // One broadcast per channel — a channel can cover multiple addresses.
                    const targets = new Array<{ isIPv4: boolean; address: string }>();
                    if (ipV4.length > 0 && this.#broadcastAddressIpv4 !== undefined) {
                        targets.push({ isIPv4: true, address: this.#broadcastAddressIpv4 });
                    }
                    if (ipV6.length > 0) {
                        targets.push({ isIPv4: false, address: this.#broadcastAddressIpv6 });
                    }
                    await MatterAggregateError.allSettled(
                        targets.map(({ isIPv4, address }) =>
                            this.#sendOn(result, netInterface, isIPv4, address, message),
                        ),
                        `Error sending UDP Multicast message on interface ${netInterface}`,
                    );
                }),
                "Error sending UDP Multicast message",
            );
        }

        return result?.settle(this.#lifetime.isClosing);
    }

    /** Send on one channel; a failure goes to {@link result}, or is logged when the caller named no interface. */
    async #sendOn(
        result: SendResult | undefined,
        netInterface: string,
        isIPv4: boolean,
        address: string,
        message: Bytes,
        isUnicast = false,
    ) {
        try {
            await (await this.broadcastChannels.get(netInterface, isIPv4)).send(address, this.#broadcastPort, message);
            result?.sent();
        } catch (error) {
            const where = `${netInterface} (${isIPv4 ? "IPv4" : "IPv6"})${isUnicast ? ` to ${address}` : ""}`;
            if (result === undefined) {
                this.#logSendFailure(`${where}: ${asError(error).message}`);
            } else {
                result.failed(where, error);
            }
            await this.#evictBroadcastChannel(netInterface, isIPv4);
        }
    }

    /** Send failures while the server closes are routine at shutdown. */
    #logSendFailure(message: string) {
        if (this.#lifetime.isClosing) {
            logger.debug(message);
        } else {
            logger.info(message);
        }
    }

    /**
     * Drop a broadcast channel after a send failure so the next send rebinds it. A failed send can mean the cached
     * socket is bound to an interface address that no longer exists (e.g. after the host resumed from standby).
     * Eviction must never escalate a send failure, so closing the stale socket is best-effort.
     */
    async #evictBroadcastChannel(netInterface: string, isIPv4: boolean) {
        try {
            await this.broadcastChannels.evict(netInterface, isIPv4);
        } catch (error) {
            this.#logSendFailure(`${netInterface}: failed to evict broadcast channel: ${asError(error).message}`);
        }
    }

    private async createBroadcastChannel(netInterface: string, isIPv4: boolean): Promise<UdpSocket> {
        return await this.network.createUdpSocket({
            lifetime: this.#lifetime,
            type: isIPv4 ? "udp4" : "udp6",
            listeningPort: this.#broadcastPort,
            netInterface,
            reuseAddress: true,
        });
    }

    async close() {
        using _closing = this.#lifetime.closing();
        await this.#serverIpv4?.close();
        await this.#serverIpv6.close();
        await this.broadcastChannels.close();
    }
}

/** The outcome of one send on a named interface, see {@link UdpMulticastServer.send}. */
class SendResult {
    readonly #netInterface: string;
    readonly #failures = new Array<{ where: string; error: unknown }>();
    #sentCount = 0;
    #hasNoAddress = false;

    constructor(netInterface: string) {
        this.#netInterface = netInterface;
    }

    sent() {
        this.#sentCount++;
    }

    failed(where: string, error: unknown) {
        this.#failures.push({ where, error });
    }

    noAddress() {
        this.#hasNoAddress = true;
    }

    /** The reach of the send, or the failure the caller receives; failures it does not receive log at debug level. */
    settle(isClosing: boolean): UdpMulticastServer.Reach {
        if (isClosing || this.#sentCount > 0) {
            const carried = this.#sentCount > 0 ? this.#failures[0] : undefined;
            for (const failure of this.#failures) {
                if (failure !== carried) {
                    logger.debug(`${failure.where}: ${asError(failure.error).message}`);
                }
            }
            if (this.#sentCount === 0) {
                return { kind: "none" };
            }
            if (carried === undefined) {
                return { kind: "all" };
            }
            const { where, error } = carried;
            return {
                kind: "some",
                failure: new NetworkError(`Send failed on ${where}: ${asError(error).message}`, { cause: error }),
            };
        }
        if (this.#hasNoAddress) {
            throw new NoAddressAvailableError(`No address to send from on interface ${this.#netInterface}`);
        }
        const [first] = this.#failures;
        if (first !== undefined) {
            const failures = this.#failures.map(({ where, error }) => `${where}: ${asError(error).message}`);
            throw new NetworkError(`Send failed on ${failures.join(", ")}`, { cause: first.error });
        }
        return { kind: "none" };
    }
}

export namespace UdpMulticastServer {
    /**
     * How far a send on a named interface reached: every address family it tried, only some of them, or none, because
     * the interface has addresses only of a family the server does not use or because the server closes.  A send that
     * reached only some families carries the failure that happened first, which names the address family and the
     * error.
     */
    export type Reach = { kind: "all" } | { kind: "some"; failure: NetworkError } | { kind: "none" };
}
