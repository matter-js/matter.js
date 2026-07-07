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

/** A network whose sockets fail their sends on demand, mimicking an interface address that vanished after wake. */
class FaultyMockNetwork extends MockNetwork {
    createCount = 0;
    failSends = false;

    override async createUdpSocket(options: Parameters<MockNetwork["createUdpSocket"]>[0]) {
        this.createCount++;
        const socket = await super.createUdpSocket(options);
        const send = socket.send.bind(socket);
        socket.send = async (host, port, payload) => {
            if (this.failSends) {
                throw new Error("setMulticastInterface EADDRNOTAVAIL");
            }
            return send(host, port, payload);
        };
        return socket;
    }
}

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

    it("evicts a broadcast channel after a send failure and rebinds on the next send", async () => {
        const simulator = new NetworkSimulator();
        const network = new FaultyMockNetwork(simulator, "00:11:22:33:44:03", ["192.168.1.4", "fe80::3"]);

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
            // Ignore the listening sockets created during setup; only count broadcast channels from here on.
            network.createCount = 0;

            network.failSends = true;
            await server.send(new Uint8Array([1, 2, 3]));
            expect(broadcastDestinations).deep.equals([]);
            expect(network.createCount).equals(2);

            network.failSends = false;
            await server.send(new Uint8Array([1, 2, 3]));
            // createCount === 4 (not 2) proves the failed channels were evicted and rebuilt rather than reused.
            expect(network.createCount).equals(4);
            expect(broadcastDestinations.sort()).deep.equals([BROADCAST_IPV4, BROADCAST_IPV6]);
        } finally {
            await server.close();
            await network.close();
        }
    });
});
