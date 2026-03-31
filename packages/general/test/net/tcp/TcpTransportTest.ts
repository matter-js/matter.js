/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, ChannelType } from "#net/Channel.js";
import { NetworkSimulator } from "#net/mock/NetworkSimulator.js";
import { TcpChannel } from "#net/tcp/TcpChannel.js";
import { TcpTransport } from "#net/tcp/TcpTransport.js";
import { Bytes } from "#util/Bytes.js";

const SERVER_PORT = 5540;

describe("TcpTransport", () => {
    let simulator: NetworkSimulator;

    beforeEach(() => {
        simulator = new NetworkSimulator();
    });

    describe("supports", () => {
        it("returns true for TCP", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            try {
                expect(transport.supports(ChannelType.TCP)).equals(true);
            } finally {
                await transport.close();
            }
        });

        it("returns false for UDP", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            try {
                expect(transport.supports(ChannelType.UDP)).equals(false);
            } finally {
                await transport.close();
            }
        });

        it("returns false for BLE", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            try {
                expect(transport.supports(ChannelType.BLE)).equals(false);
            } finally {
                await transport.close();
            }
        });
    });

    describe("openChannel", () => {
        it("throws for non-IP address", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            try {
                await expect(transport.openChannel({ type: "ble", peripheralAddress: "AA:BB:CC" } as any)).rejectedWith(
                    "does not support non-IP",
                );
            } finally {
                await transport.close();
            }
        });

        it("connects to a remote server", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });
            const clientTransport = await TcpTransport.create({ network: host2 });

            try {
                const channel = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });

                expect(channel).instanceof(TcpChannel);
                expect(channel.type).equals(ChannelType.TCP);
            } finally {
                await clientTransport.close();
                await serverTransport.close();
            }
        });

        it("reuses existing connection for same address", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });
            const clientTransport = await TcpTransport.create({ network: host2 });

            try {
                const channel1 = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });
                const channel2 = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });

                expect(channel1).equals(channel2);
            } finally {
                await clientTransport.close();
                await serverTransport.close();
            }
        });

        it("creates different connections for different addresses", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);
            const host3 = simulator.addHost(3);

            const server1 = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });
            const server2 = await TcpTransport.create({
                network: host2,
                listeningPort: SERVER_PORT,
            });
            const clientTransport = await TcpTransport.create({ network: host3 });

            try {
                const channel1 = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });
                const channel2 = await clientTransport.openChannel({
                    ip: "abcd::2",
                    port: SERVER_PORT,
                });

                expect(channel1).not.equals(channel2);
            } finally {
                await clientTransport.close();
                await server1.close();
                await server2.close();
            }
        });
    });

    describe("onConnect", () => {
        it("fires when a remote client connects", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });

            const connected: Channel<Bytes>[] = [];
            serverTransport.onConnect(channel => connected.push(channel));

            const clientTransport = await TcpTransport.create({ network: host2 });

            try {
                await clientTransport.openChannel({ ip: "abcd::1", port: SERVER_PORT });

                expect(connected).length(1);
                expect(connected[0]).instanceof(TcpChannel);
            } finally {
                await clientTransport.close();
                await serverTransport.close();
            }
        });
    });

    describe("onData", () => {
        it("fires when a framed message is received", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });

            const received: { channel: Channel<Bytes>; data: Bytes }[] = [];
            serverTransport.onData((channel, data) => received.push({ channel, data }));

            const clientTransport = await TcpTransport.create({ network: host2 });

            try {
                const channel = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });

                const payload = Bytes.fromHex("deadbeef");
                await channel.send(payload);

                expect(received).length(1);
                expect(Bytes.toHex(received[0].data)).equals("deadbeef");
            } finally {
                await clientTransport.close();
                await serverTransport.close();
            }
        });
    });

    describe("onDisconnect", () => {
        it("fires when a connection drops", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });

            const disconnected: Channel<Bytes>[] = [];
            serverTransport.onDisconnect(channel => disconnected.push(channel));

            const clientTransport = await TcpTransport.create({ network: host2 });

            try {
                const channel = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });

                // Close the client-side channel, which should trigger disconnect on server
                await channel.close();

                expect(disconnected).length(1);
            } finally {
                await clientTransport.close();
                await serverTransport.close();
            }
        });
    });

    describe("close", () => {
        it("closes server and all connections", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });

            const clientTransport = await TcpTransport.create({ network: host2 });

            try {
                const channel = await clientTransport.openChannel({
                    ip: "abcd::1",
                    port: SERVER_PORT,
                });

                // Both transports should close without error
                await serverTransport.close();
                await clientTransport.close();

                // Sending after close should fail
                await expect(channel.send(Bytes.fromHex("ff"))).rejected;
            } finally {
                await clientTransport.close();
                await serverTransport.close();
            }
        });
    });
});
