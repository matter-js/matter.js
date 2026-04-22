/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockNetwork, NetworkSimulator, UdpMulticastServer } from "#index.js";

const BROADCAST_PORT = 5540;
const BROADCAST_IPV4 = "224.0.0.251";
const BROADCAST_IPV6 = "ff02::fb";
const NET_INTERFACE = "fake0";

describe("UdpMulticastServer", () => {
    it("sends at most once per IP family when an interface has multiple same-family addresses", async () => {
        const simulator = new NetworkSimulator();
        const network = new MockNetwork(simulator, "00:11:22:33:44:01", [
            "192.168.1.2",
            "fe80::1",
            "fd00::2",
            "2001:db8::3",
        ]);

        const broadcastDestinations = new Array<string>();
        simulator.router.intercept((packet, next) => {
            if (packet.kind === "udp" && packet.destPort === BROADCAST_PORT) {
                broadcastDestinations.push(packet.destAddress);
            }
            next(packet);
        });

        const server = await UdpMulticastServer.create({
            network,
            listeningPort: BROADCAST_PORT,
            broadcastAddressIpv4: BROADCAST_IPV4,
            broadcastAddressIpv6: BROADCAST_IPV6,
            netInterface: NET_INTERFACE,
        });

        try {
            await server.send(new Uint8Array([1, 2, 3]));
        } finally {
            await server.close();
            await network.close();
        }

        expect(broadcastDestinations.sort()).to.deep.equal([BROADCAST_IPV4, BROADCAST_IPV6]);
    });

    it("skips IPv4 when no broadcast address is configured", async () => {
        const simulator = new NetworkSimulator();
        const network = new MockNetwork(simulator, "00:11:22:33:44:02", ["192.168.1.3", "fe80::2"]);

        const broadcastDestinations = new Array<string>();
        simulator.router.intercept((packet, next) => {
            if (packet.kind === "udp" && packet.destPort === BROADCAST_PORT) {
                broadcastDestinations.push(packet.destAddress);
            }
            next(packet);
        });

        const server = await UdpMulticastServer.create({
            network,
            listeningPort: BROADCAST_PORT,
            broadcastAddressIpv6: BROADCAST_IPV6,
            netInterface: NET_INTERFACE,
        });

        try {
            await server.send(new Uint8Array([1, 2, 3]));
        } finally {
            await server.close();
            await network.close();
        }

        expect(broadcastDestinations).to.deep.equal([BROADCAST_IPV6]);
    });
});
