/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Diagnostic,
    LogDestination,
    Logger,
    LogLevel,
    MockNetwork,
    NetworkError,
    NetworkSimulator,
    NoAddressAvailableError,
    UdpMulticastServer,
    UdpSocketOptions,
} from "#index.js";

const BROADCAST_PORT = 5540;
const BROADCAST_IPV4 = "224.0.0.251";
const BROADCAST_IPV6 = "ff02::fb";
const NET_INTERFACE = "fake0";

/** A network whose sockets fail their sends on demand, mimicking an interface address that vanished after wake. */
class FaultyMockNetwork extends MockNetwork {
    createCount = 0;
    failSends = false;
    readonly failingTypes = new Set<UdpSocketOptions["type"]>();

    override async createUdpSocket(options: UdpSocketOptions) {
        this.createCount++;
        const socket = await super.createUdpSocket(options);
        const send = socket.send.bind(socket);
        socket.send = async (host, port, payload) => {
            if (this.failSends || this.failingTypes.has(options.type)) {
                throw new NetworkError("setMulticastInterface EADDRNOTAVAIL");
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

    it("opens no broadcast channel for a send after the server closed", async () => {
        const network = new SocketCountingNetwork(new NetworkSimulator(), "00:11:22:33:44:07", [
            "192.168.1.8",
            "fe80::7",
        ]);
        const server = await UdpMulticastServer.create({
            network,
            listeningPort: BROADCAST_PORT,
            broadcastAddressIpv4: BROADCAST_IPV4,
            broadcastAddressIpv6: BROADCAST_IPV6,
            netInterface: NET_INTERFACE,
        });

        const levels = captureLogLevels();
        try {
            await server.close();
            await server.send(new Uint8Array([1, 2, 3]));
            await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE, "192.168.1.9");

            expect(network.openSockets).equals(0);
            expect(levels).not.empty;
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        } finally {
            delete Logger.destinations.capture;
            await network.close();
        }
    });

    // Characterization: also holds without the closed check, because close() expires a channel a racing send creates
    it("leaves no broadcast channel open for a send started while the server closes", async () => {
        const network = new SocketCountingNetwork(new NetworkSimulator(), "00:11:22:33:44:08", [
            "192.168.1.10",
            "fe80::8",
        ]);
        const server = await UdpMulticastServer.create({
            network,
            listeningPort: BROADCAST_PORT,
            broadcastAddressIpv4: BROADCAST_IPV4,
            broadcastAddressIpv6: BROADCAST_IPV6,
            netInterface: NET_INTERFACE,
        });

        try {
            const closing = server.close();
            await server.send(new Uint8Array([1, 2, 3]));
            await closing;

            expect(network.openSockets).equals(0);
        } finally {
            await network.close();
        }
    });

    describe("send on a named interface", () => {
        let network: FaultyMockNetwork;
        let server: UdpMulticastServer;
        let levels: LogLevel[];

        beforeEach(async () => {
            network = new FaultyMockNetwork(new NetworkSimulator(), "00:11:22:33:44:09", ["192.168.1.11", "fe80::9"]);
            server = await UdpMulticastServer.create({
                network,
                listeningPort: BROADCAST_PORT,
                broadcastAddressIpv4: BROADCAST_IPV4,
                broadcastAddressIpv6: BROADCAST_IPV6,
                netInterface: NET_INTERFACE,
            });
            levels = captureLogLevels();
        });

        afterEach(async () => {
            delete Logger.destinations.capture;
            await server.close();
            await network.close();
        });

        it("rejects when a multicast send fails, and leaves the logging to the caller", async () => {
            network.failSends = true;

            await expect(server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).rejectedWith(
                NetworkError,
                "Send failed on fake0 (IPv4): setMulticastInterface EADDRNOTAVAIL, fake0 (IPv6): setMulticastInterface EADDRNOTAVAIL",
            );
            expect(levels).deep.equals([]);
        });

        it("names the first socket error as the cause", async () => {
            network.failSends = true;

            const error = await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE).then(
                () => undefined,
                (error: unknown) => error,
            );

            expect(error).instanceOf(NetworkError);
            expect(error instanceof Error ? error.cause : undefined)
                .instanceOf(NetworkError)
                .property("message", "setMulticastInterface EADDRNOTAVAIL");
        });

        it("resolves to all when the datagram left on every address family", async () => {
            expect(await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).deep.equals({ kind: "all" });
        });

        it("sends only on IPv6 from an interface without an IPv4 address", async () => {
            const destinations = new Array<string>();
            network.simulator.router.intercept((packet, next) => {
                if (packet.kind === "udp" && packet.destPort === BROADCAST_PORT) {
                    destinations.push(packet.destAddress);
                }
                next(packet);
            });
            network.deleteAddr("192.168.1.11");

            expect(await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).deep.equals({ kind: "all" });
            expect(destinations).deep.equals([BROADCAST_IPV6]);
        });

        it("resolves to some with the failure of the other family when the datagram left on one family", async () => {
            network.failingTypes.add("udp4");

            const reach = await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE);

            expect(reach?.kind).equals("some");
            const failure = reach?.kind === "some" ? reach.failure : undefined;
            expect(failure)
                .instanceOf(NetworkError)
                .property("message", "Send failed on fake0 (IPv4): setMulticastInterface EADDRNOTAVAIL");
            expect(failure?.cause).instanceOf(NetworkError).property("message", "setMulticastInterface EADDRNOTAVAIL");
            expect(levels).deep.equals([]);
        });

        it("evicts the channel after a failed unicast send", async () => {
            network.createCount = 0;
            network.failSends = true;
            await expect(server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE, "192.168.1.9")).rejectedWith(
                NetworkError,
            );

            network.failSends = false;
            await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE, "192.168.1.9");

            expect(network.createCount).equals(2);
        });

        it("rejects when a unicast send fails", async () => {
            network.failSends = true;

            await expect(server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE, "192.168.1.9")).rejectedWith(
                NetworkError,
                "Send failed on fake0 (IPv4) to 192.168.1.9: setMulticastInterface EADDRNOTAVAIL",
            );
        });

        it("rejects when the interface has no address to send from", async () => {
            network.deleteAddr("192.168.1.11", "fe80::9");

            await expect(server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).rejectedWith(
                NoAddressAvailableError,
                "No address to send from on interface fake0",
            );
        });

        it("resolves to none on an interface whose addresses are all of a family the server does not use", async () => {
            await server.close();
            server = await UdpMulticastServer.create({
                network,
                listeningPort: BROADCAST_PORT,
                broadcastAddressIpv6: BROADCAST_IPV6,
                netInterface: NET_INTERFACE,
            });
            network.deleteAddr("fe80::9");
            network.createCount = 0;

            expect(await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).deep.equals({ kind: "none" });

            expect(network.createCount).equals(0);
            expect(levels).deep.equals([]);
        });

        it("resolves and logs a failed send without a named interface", async () => {
            network.failSends = true;

            await server.send(new Uint8Array([1, 2, 3]));
            network.deleteAddr("192.168.1.11", "fe80::9");
            await server.send(new Uint8Array([1, 2, 3]));

            expect(levels).deep.equals([LogLevel.INFO, LogLevel.INFO]);
        });

        it("resolves a failed send while the server closes", async () => {
            network.failSends = true;
            const closing = server.close();

            expect(await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).deep.equals({ kind: "none" });
            network.deleteAddr("192.168.1.11", "fe80::9");
            expect(await server.send(new Uint8Array([1, 2, 3]), NET_INTERFACE)).deep.equals({ kind: "none" });
            await closing;

            expect(levels).not.empty;
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });
    });

    it("closes the IPv4 socket when the IPv6 socket cannot be created", async () => {
        await expectFailedStartToCloseSockets("create", "00:11:22:33:44:04", ["192.168.1.5", "fe80::4"]);
    });

    it("closes both sockets when the IPv6 socket cannot join the multicast group", async () => {
        await expectFailedStartToCloseSockets("membership", "00:11:22:33:44:05", ["192.168.1.6", "fe80::5"]);
    });
});

/** Collects the levels of UdpMulticastServer log messages until `Logger.destinations.capture` is deleted. */
function captureLogLevels() {
    const levels = new Array<LogLevel>();
    Logger.destinations.capture = LogDestination({
        add(message: Diagnostic.Message) {
            if (message.facility === "UdpMulticastServer") {
                levels.push(message.level);
            }
        },
    });
    return levels;
}

/** A network that counts the sockets left open. */
class SocketCountingNetwork extends MockNetwork {
    openSockets = 0;

    override async createUdpSocket(options: UdpSocketOptions) {
        const socket = await super.createUdpSocket(options);
        this.openSockets++;
        const close = socket.close.bind(socket);
        socket.close = async () => {
            this.openSockets--;
            await close();
        };
        return socket;
    }
}

/** A network whose IPv6 socket fails to open or to join a group, and that counts the sockets left open. */
class Ipv6FailingNetwork extends MockNetwork {
    openSockets = 0;
    failure: "create" | "membership" = "create";

    override async createUdpSocket(options: UdpSocketOptions) {
        if (options.type === "udp6" && this.failure === "create") {
            throw new NoAddressAvailableError("IPv6 socket failed");
        }
        const socket = await super.createUdpSocket(options);
        this.openSockets++;
        const close = socket.close.bind(socket);
        socket.close = async () => {
            this.openSockets--;
            await close();
        };
        if (options.type === "udp6") {
            socket.addMembership = async () => {
                throw new NetworkError("IPv6 socket failed");
            };
        }
        return socket;
    }
}

async function expectFailedStartToCloseSockets(failure: Ipv6FailingNetwork["failure"], mac: string, ips: string[]) {
    const network = new Ipv6FailingNetwork(new NetworkSimulator(), mac, ips);
    network.failure = failure;

    try {
        await expect(
            UdpMulticastServer.create({
                network,
                listeningPort: BROADCAST_PORT,
                broadcastAddressIpv4: BROADCAST_IPV4,
                broadcastAddressIpv6: BROADCAST_IPV6,
                netInterface: NET_INTERFACE,
            }),
        ).rejectedWith("IPv6 socket failed");

        expect(network.openSockets).equals(0);
    } finally {
        await network.close();
    }
}
