/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Cache,
    InterfaceType,
    isIPv6,
    Logger,
    Minutes,
    Network,
    NetworkError,
    NetworkInterface,
    NetworkInterfaceDetails,
    onSameNetwork,
    UdpChannel,
    UdpChannelOptions,
} from "#general";
import { NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { NodeJsUdpChannel } from "./NodeJsUdpChannel.js";

const logger = Logger.get("NetworkNode");

export class NodeJsNetwork extends Network {
    static getMulticastInterfaceIpv4(netInterface: string): string | undefined {
        const netInterfaceInfo = networkInterfaces()[netInterface];
        if (netInterfaceInfo === undefined) throw new NetworkError(`Unknown interface: ${netInterface}`);
        for (const info of netInterfaceInfo) {
            if (familyIs(4, info)) {
                return info.address;
            }
        }
        return undefined;
    }

    static getMembershipMulticastInterfaces(
        netInterfaceOrZone: string | undefined,
        ipv4: boolean,
    ): (string | undefined)[] {
        if (ipv4) {
            return [undefined];
        } else {
            const multicastInterfaces = Object.entries(networkInterfaces()).flatMap(([netIf, netIfInfo]) => {
                if (netIfInfo === undefined) {
                    return [];
                }
                const zone = this.getNetInterfaceZoneIpv6Internal(netIf, netIfInfo);
                if (zone === undefined) {
                    return [];
                }
                // zone is either the interface scope id (windows) or the interface name (linux, macos)
                // The potentially provided interface follows the same logic because it was pre-processed
                if (netInterfaceOrZone !== undefined && netInterfaceOrZone !== zone) {
                    return [];
                }
                return [`::%${zone}`];
            });
            if (multicastInterfaces.length === 0) {
                logger.warn(
                    `No IPv6 multicast interface found${
                        netInterfaceOrZone !== undefined ? ` for interface ${netInterfaceOrZone}` : ""
                    }.`,
                );
            }
            return multicastInterfaces;
        }
    }

    static getNetInterfaceZoneIpv6(netInterface: string): string | undefined {
        const netInterfaceInfo = networkInterfaces()[netInterface];
        if (netInterfaceInfo === undefined) throw new NetworkError(`Unknown interface: ${netInterface}`);
        return this.getNetInterfaceZoneIpv6Internal(netInterface, netInterfaceInfo);
    }

    static getNetInterfaceForIp(ip: string) {
        // Finding the local interface on the same interface is complex and won't change
        // So let's cache the results for 5mn
        return this.netInterfaces.get(ip);
    }

    private static readonly netInterfaces = new Cache<string | undefined, void>(
        "Network interface",
        (ip: string) => this.getNetInterfaceForRemoteAddress(ip),
        Minutes(5),
    );

    override async close() {
        NodeJsNetwork.netInterfaces.close();
    }

    private static getNetInterfaceForRemoteAddress(ip: string) {
        if (ip.includes("%")) {
            // IPv6 address with scope
            return ip.split("%")[1];
        } else {
            const interfaces = networkInterfaces();
            for (const name in interfaces) {
                const netInterfaces = interfaces[name] as NetworkInterfaceInfo[];
                for (const { address, netmask } of netInterfaces) {
                    if (onSameNetwork(ip, address, netmask)) {
                        return this.getNetInterfaceZoneIpv6Internal(name, netInterfaces);
                    }
                }
            }
            if (isIPv6(ip)) {
                if (ip.startsWith("fd")) {
                    // IPv6 address is an ULA
                    return ""; // consider it as being ok and using the "Default interface"
                }
            }
            return undefined;
        }
    }

    private static getNetInterfaceZoneIpv6Internal(
        netInterface: string,
        netInterfaceInfos: NetworkInterfaceInfo[] | undefined,
    ): string | undefined {
        if (process.platform !== "win32") {
            return netInterface;
        }
        if (netInterfaceInfos === undefined) return undefined;
        return netInterfaceInfos
            .find(info => familyIs(6, info) && info.address.startsWith("fe80::"))
            ?.scopeid?.toString();
    }

    /**
     * Get all network interfaces.
     * The optional configuration parameter allows to map interface names to types if this mapping is known.
     * Each network interface which has no mapped type is returned as Ethernet for now.
     *
     * @param configuration - An array of objects with the name and type properties.
     */
    getNetInterfaces(configuration: NetworkInterface[] = []): NetworkInterface[] {
        const result = new Array<NetworkInterface>();
        const interfaces = networkInterfaces();
        for (const name in interfaces) {
            const netInterfaces = interfaces[name] as NetworkInterfaceInfo[];
            if (netInterfaces.length === 0) continue;
            if (netInterfaces[0].internal) continue;
            let type = InterfaceType.Ethernet;
            if (configuration.length > 0) {
                const nameType = configuration.find(({ name: mapName }) => name === mapName);
                if (nameType !== undefined && nameType.type !== undefined) {
                    type = nameType.type;
                }
            }
            result.push({ name, type });
        }
        return result;
    }

    getIpMac(netInterface: string): NetworkInterfaceDetails | undefined {
        const netInterfaceInfo = networkInterfaces()[netInterface];
        if (netInterfaceInfo === undefined) return undefined;
        const ipV4 = netInterfaceInfo.filter(info => familyIs(4, info)).map(({ address }) => address);
        const ipV6 = netInterfaceInfo.filter(info => familyIs(6, info)).map(({ address }) => address);
        return { mac: netInterfaceInfo[0].mac, ipV4, ipV6 };
    }

    override createUdpChannel(options: UdpChannelOptions): Promise<UdpChannel> {
        return NodeJsUdpChannel.create(options);
    }
}

function familyIs(version: number, { family }: NetworkInterfaceInfo) {
    return family === `IPv${version}`;
}
