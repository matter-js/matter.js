/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError } from "#MatterError.js";
import { Minutes } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
import { Lifetime } from "#util/Lifetime.js";
import { Logger } from "../../log/Logger.js";
import { Cache } from "../../util/Cache.js";
import { asError } from "../../util/Error.js";
import { isIPv4 } from "../../util/Ip.js";
import { Network, NoAddressAvailableError } from "../Network.js";
import { UdpChannel } from "./UdpChannel.js";

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
    readonly #serverIpv4: UdpChannel | undefined;
    readonly #serverIpv6: UdpChannel;

    static async create({
        netInterface,
        broadcastAddressIpv4,
        broadcastAddressIpv6,
        listeningPort,
        network,
        lifetime: lifetimeOwner,
    }: UdpMulticastServerOptions) {
        const lifetime = (lifetimeOwner || Lifetime.process)?.join("multicast server");

        try {
            let ipv4UdpChannel: UdpChannel | undefined = undefined;
            if (broadcastAddressIpv4 !== undefined) {
                try {
                    ipv4UdpChannel = await network.createUdpChannel({
                        lifetime,
                        type: "udp4",
                        netInterface,
                        listeningPort,
                        reuseAddress: true,
                    });
                    await ipv4UdpChannel.addMembership(broadcastAddressIpv4);
                } catch (error) {
                    NoAddressAvailableError.accept(error);
                    logger.info(
                        `IPv4 UDP channel not created because IPv4 is not available: ${asError(error).message}`,
                    );
                }
            }

            let ipv6UdpChannel;
            try {
                ipv6UdpChannel = await network.createUdpChannel({
                    lifetime,
                    type: "udp6",
                    netInterface,
                    listeningPort,
                    reuseAddress: true,
                });
                await ipv6UdpChannel.addMembership(broadcastAddressIpv6);
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
                ipv4UdpChannel,
                ipv6UdpChannel,
                netInterface,
            );
        } catch (error) {
            lifetime[Symbol.dispose]();
            throw error;
        }
    }

    private readonly broadcastChannels = new Cache<Promise<UdpChannel>>(
        "UDP broadcast channel",
        (netInterface, iPv4) => this.createBroadcastChannel(netInterface, iPv4),
        Minutes(5),
        async (_netInterface, channel) => (await channel).close(),
    );

    private constructor(
        lifetime: Lifetime,
        network: Network,
        broadcastAddressIpv4: string | undefined,
        broadcastAddressIpv6: string,
        broadcastPort: number,
        serverIpv4: UdpChannel | undefined,
        serverIpv6: UdpChannel,
        netInterface: string | undefined,
    ) {
        this.#lifetime = lifetime;
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

    async send(message: Bytes, netInterface?: string, uniCastTarget?: string) {
        netInterface = netInterface ?? this.netInterface;

        // When we know the network interface and the unicast target, we can send unicast
        if (uniCastTarget !== undefined && netInterface !== undefined) {
            try {
                await (
                    await this.broadcastChannels.get(netInterface, isIPv4(uniCastTarget))
                ).send(uniCastTarget, this.#broadcastPort, message);
            } catch (error) {
                logger.info(`${netInterface} ${uniCastTarget}: ${asError(error).message}`);
            }
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
                    const ips = [...ipV4, ...ipV6];
                    await MatterAggregateError.allSettled(
                        ips.map(async ip => {
                            const iPv4 = ipV4.includes(ip);
                            const broadcastTarget = iPv4 ? this.#broadcastAddressIpv4 : this.#broadcastAddressIpv6;
                            if (broadcastTarget === undefined) {
                                // IPv4 but disabled, so just resolve
                                return;
                            }
                            try {
                                await (
                                    await this.broadcastChannels.get(netInterface, iPv4)
                                ).send(broadcastTarget, this.#broadcastPort, message);
                            } catch (error) {
                                logger.info(`${netInterface}: ${asError(error).message}`);
                            }
                        }),
                        `Error sending UDP Multicast message on interface ${netInterface}`,
                    );
                }),
                "Error sending UDP Multicast message",
            );
        }
    }

    private async createBroadcastChannel(netInterface: string, iPv4: string): Promise<UdpChannel> {
        return await this.network.createUdpChannel({
            lifetime: this.#lifetime,
            type: iPv4 ? "udp4" : "udp6",
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
