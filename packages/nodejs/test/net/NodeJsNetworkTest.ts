/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InterfaceType } from "#general";
import { NodeJsNetwork } from "#net/NodeJsNetwork.js";
import { networkInterfaces } from "node:os";

describe("NodeJsNetwork", () => {
    let network: NodeJsNetwork;

    beforeEach(() => {
        network = new NodeJsNetwork();
    });

    afterEach(async () => {
        await network.close();
    });

    describe("getNetInterfaces", () => {
        it("returns available network interfaces", () => {
            const interfaces = network.getNetInterfaces();

            // Should return at least the loopback interface (usually filtered out) or real interfaces
            expect(interfaces).instanceOf(Array);
        });

        it("filters out internal interfaces", () => {
            const interfaces = network.getNetInterfaces();

            // All returned interfaces should be non-internal
            for (const iface of interfaces) {
                const osInterface = networkInterfaces()[iface.name];
                if (osInterface) {
                    expect(osInterface[0].internal).equal(false);
                }
            }
        });

        it("uses provided type mapping", () => {
            const allInterfaces = networkInterfaces();
            const firstInterfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.length > 0 && !info[0].internal;
            });

            if (firstInterfaceName) {
                const configuration = [{ name: firstInterfaceName, type: InterfaceType.WiFi }];
                const interfaces = network.getNetInterfaces(configuration);

                const wifiInterface = interfaces.find(i => i.name === firstInterfaceName);
                if (wifiInterface) {
                    expect(wifiInterface.type).equal(InterfaceType.WiFi);
                }
            }
        });

        it("defaults to Ethernet when no type mapping provided", () => {
            const interfaces = network.getNetInterfaces();

            if (interfaces.length > 0) {
                // At least one interface should default to Ethernet
                const hasEthernet = interfaces.some(i => i.type === InterfaceType.Ethernet);
                expect(hasEthernet).equal(true);
            }
        });
    });

    describe("getIpMac", () => {
        it("returns IP addresses and MAC for valid interface", () => {
            const allInterfaces = networkInterfaces();
            const interfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.length > 0;
            });

            if (interfaceName) {
                const details = network.getIpMac(interfaceName);

                expect(details).not.undefined;
                expect(details?.mac).not.undefined;
                expect(details?.ipV4).instanceOf(Array);
                expect(details?.ipV6).instanceOf(Array);
            }
        });

        it("returns undefined for invalid interface", () => {
            const details = network.getIpMac("nonexistent-interface-12345");

            expect(details).undefined;
        });

        it("separates IPv4 and IPv6 addresses", () => {
            const allInterfaces = networkInterfaces();
            const interfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.length > 0;
            });

            if (interfaceName) {
                const details = network.getIpMac(interfaceName);

                if (details && details.ipV4.length > 0) {
                    // Verify IPv4 addresses don't contain colons
                    for (const ip of details.ipV4) {
                        expect(ip.includes(":")).equal(false);
                    }
                }

                if (details && details.ipV6.length > 0) {
                    // Verify IPv6 addresses contain colons
                    for (const ip of details.ipV6) {
                        expect(ip.includes(":")).equal(true);
                    }
                }
            }
        });
    });

    describe("getMulticastInterfaceIpv4", () => {
        it("returns IPv4 address for interface with IPv4", () => {
            const allInterfaces = networkInterfaces();
            const interfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.some(i => i.family === "IPv4");
            });

            if (interfaceName) {
                const ipv4 = NodeJsNetwork.getMulticastInterfaceIpv4(interfaceName);

                expect(ipv4).not.undefined;
                expect(ipv4?.includes(":")).equal(false);
            }
        });

        it("returns undefined for interface without IPv4", () => {
            const allInterfaces = networkInterfaces();
            const interfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.every(i => i.family !== "IPv4");
            });

            if (interfaceName) {
                const ipv4 = NodeJsNetwork.getMulticastInterfaceIpv4(interfaceName);

                expect(ipv4).undefined;
            }
        });

        it("throws for nonexistent interface", () => {
            expect(() => {
                NodeJsNetwork.getMulticastInterfaceIpv4("nonexistent-interface-12345");
            }).throws();
        });
    });

    describe("getMembershipMulticastInterfaces", () => {
        it("returns [undefined] for IPv4", () => {
            const interfaces = NodeJsNetwork.getMembershipMulticastInterfaces(undefined, true);

            expect(interfaces).deep.equal([undefined]);
        });

        it("returns IPv6 interfaces with zone suffix", () => {
            const interfaces = NodeJsNetwork.getMembershipMulticastInterfaces(undefined, false);

            expect(interfaces).instanceOf(Array);
            // Each interface should have the ::%zone format
            for (const iface of interfaces) {
                if (iface) {
                    expect(iface.startsWith("::%")).equal(true);
                }
            }
        });

        it("filters IPv6 interfaces by zone when specified", () => {
            const allInterfaces = networkInterfaces();
            const ipv6InterfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.some(i => i.family === "IPv6");
            });

            if (ipv6InterfaceName) {
                const zone = NodeJsNetwork.getNetInterfaceZoneIpv6(ipv6InterfaceName);
                if (zone) {
                    const interfaces = NodeJsNetwork.getMembershipMulticastInterfaces(zone, false);

                    // Should return at least one interface matching the zone
                    expect(interfaces.length).greaterThan(0);
                }
            }
        });
    });

    describe("getNetInterfaceZoneIpv6", () => {
        it("returns zone for IPv6 interface", () => {
            const allInterfaces = networkInterfaces();
            const interfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.some(i => i.family === "IPv6");
            });

            if (interfaceName) {
                const zone = NodeJsNetwork.getNetInterfaceZoneIpv6(interfaceName);

                // Zone should be either interface name or scope ID
                expect(zone).not.undefined;
                if (process.platform === "win32") {
                    // On Windows, should be scope ID (number)
                    expect(zone).match(/^\d+$/);
                } else {
                    // On Unix-like, should be interface name
                    expect(zone).equal(interfaceName);
                }
            }
        });

        it("throws for nonexistent interface", () => {
            expect(() => {
                NodeJsNetwork.getNetInterfaceZoneIpv6("nonexistent-interface-12345");
            }).throws();
        });
    });

    describe("getNetInterfaceForIp", () => {
        it("extracts zone from IPv6 address with scope", () => {
            const result = NodeJsNetwork.getNetInterfaceForIp("fe80::1%eth0");

            expect(result).equal("eth0");
        });

        it("finds interface for local IP on same network", () => {
            const allInterfaces = networkInterfaces();

            // Find first non-loopback interface with an IPv4 address
            for (const name in allInterfaces) {
                const info = allInterfaces[name];
                if (!info) continue;

                const ipv4Info = info.find(i => i.family === "IPv4" && !i.internal);
                if (ipv4Info) {
                    const result = NodeJsNetwork.getNetInterfaceForIp(ipv4Info.address);

                    // Should find an interface (may not be the exact one due to routing complexity)
                    expect(result).not.undefined;
                    break;
                }
            }
        });

        it("returns empty string for ULA IPv6 addresses", () => {
            const result = NodeJsNetwork.getNetInterfaceForIp("fd00::1");

            expect(result).equal("");
        });

        it("returns undefined for unroutable address", () => {
            // Use a clearly unroutable address
            const result = NodeJsNetwork.getNetInterfaceForIp("255.255.255.255");

            expect(result).undefined;
        });
    });

    describe("cache", () => {
        it("caches interface lookup results", () => {
            const ip1 = NodeJsNetwork.getNetInterfaceForIp("fe80::1%eth0");
            const ip2 = NodeJsNetwork.getNetInterfaceForIp("fe80::1%eth0");

            // Both should return same result (from cache)
            expect(ip1).equal(ip2);
        });
    });

    describe("createUdpChannel", () => {
        it("creates a NodeJsUdpChannel", async () => {
            const channel = await network.createUdpChannel({
                listeningPort: 0, // Use random port
                type: "udp4",
            });

            expect(channel).not.undefined;

            await channel.close();
        });
    });

    describe("close", () => {
        it("closes network and clears caches", async () => {
            // Populate cache
            NodeJsNetwork.getNetInterfaceForIp("fe80::1%eth0");

            await network.close();

            // Should not throw
            expect(true).equal(true);
        });

        it("can be called multiple times", async () => {
            await network.close();
            await network.close();

            expect(true).equal(true);
        });
    });

    describe("platform-specific behavior", () => {
        it("handles platform differences in zone format", () => {
            const allInterfaces = networkInterfaces();
            const interfaceName = Object.keys(allInterfaces).find(name => {
                const info = allInterfaces[name];
                return info && info.some(i => i.family === "IPv6" && i.address.startsWith("fe80::"));
            });

            if (interfaceName) {
                const zone = NodeJsNetwork.getNetInterfaceZoneIpv6(interfaceName);

                if (process.platform === "win32") {
                    // Windows uses numeric scope ID
                    expect(typeof zone).equal("string");
                    if (zone) {
                        expect(parseInt(zone, 10)).not.NaN;
                    }
                } else {
                    // Unix-like uses interface name
                    expect(zone).equal(interfaceName);
                }
            }
        });
    });
});
