/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError } from "#MatterError.js";
import { Minutes } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
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
}

export class UdpMulticastServer {
    static async create({
        netInterface,
        broadcastAddressIpv4,
        broadcastAddressIpv6,
        listeningPort,
        network,
    }: UdpMulticastServerOptions) {
        let ipv4UdpChannel: UdpChannel | undefined = undefined;
        if (broadcastAddressIpv4 !== undefined) {
            try {
                ipv4UdpChannel = await network.createUdpChannel({
                    type: "udp4",
                    netInterface,
                    listeningPort,
                    reuseAddress: true,
                });
                await ipv4UdpChannel.addMembership(broadcastAddressIpv4);
            } catch (error) {
                NoAddressAvailableError.accept(error);
                logger.info(`IPv4 UDP channel not created because IPv4 is not available: ${asError(error).message}`);
            }
        }

        try {
            const ipv6UdpChannel = await network.createUdpChannel({
                type: "udp6",
                netInterface,
                listeningPort,
                reuseAddress: true,
            });
            await ipv6UdpChannel.addMembership(broadcastAddressIpv6);
            return new UdpMulticastServer(
                network,
                broadcastAddressIpv4,
                broadcastAddressIpv6,
                listeningPort,
                ipv4UdpChannel,
                ipv6UdpChannel,
                netInterface,
            );
        } catch (error) {
            NoAddressAvailableError.accept(error);
            logger.info(`IPv6 UDP interface not created because IPv6 is not available, but required my Matter.`);
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
        readonly network: Network,
        private readonly broadcastAddressIpv4: string | undefined,
        private readonly broadcastAddressIpv6: string,
        private readonly broadcastPort: number,
        private readonly serverIpv4: UdpChannel | undefined,
        private readonly serverIpv6: UdpChannel,
        readonly netInterface: string | undefined,
    ) {}

    get supportsIpv4() {
        return this.serverIpv4 !== undefined;
    }

    onMessage(listener: (message: Bytes, peerAddress: string, netInterface: string) => void) {
        this.serverIpv4?.onData((netInterface, peerAddress, _port, message) => {
            if (netInterface === undefined) {
                // Ignore Network packages not coming over any known interface
                return;
            }
            listener(message, peerAddress, netInterface);
        });
        this.serverIpv6.onData((netInterface, peerAddress, _port, message) => {
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
                ).send(uniCastTarget, this.broadcastPort, message);
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
                            const broadcastTarget = iPv4 ? this.broadcastAddressIpv4 : this.broadcastAddressIpv6;
                            if (broadcastTarget === undefined) {
                                // IPv4 but disabled, so just resolve
                                return;
                            }
                            try {
                                await (
                                    await this.broadcastChannels.get(netInterface, iPv4)
                                ).send(broadcastTarget, this.broadcastPort, message);
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
            type: iPv4 ? "udp4" : "udp6",
            listeningPort: this.broadcastPort,
            netInterface,
            reuseAddress: true,
        });
    }

    async close() {
        await this.serverIpv4?.close();
        await this.serverIpv6.close();
        await this.broadcastChannels.close();
    }
}
