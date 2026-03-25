/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, ChannelType } from "#net/Channel.js";
import { NetworkSimulator } from "#net/mock/NetworkSimulator.js";
import { TcpConnection } from "#net/tcp/TcpConnection.js";
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

            expect(transport.supports(ChannelType.TCP)).equals(true);

            await transport.close();
        });

        it("returns false for UDP", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            expect(transport.supports(ChannelType.UDP)).equals(false);

            await transport.close();
        });

        it("returns false for BLE", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            expect(transport.supports(ChannelType.BLE)).equals(false);

            await transport.close();
        });
    });

    describe("openChannel", () => {
        it("throws for non-TCP address", async () => {
            const host = simulator.addHost(1);
            const transport = await TcpTransport.create({ network: host });

            await expect(transport.openChannel({ type: "udp", ip: "10.10.10.1", port: 5540 })).rejectedWith(
                "does not support address type",
            );

            await transport.close();
        });

        it("connects to a remote server", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });
            const clientTransport = await TcpTransport.create({ network: host2 });

            const channel = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });

            expect(channel).instanceof(TcpConnection);
            expect(channel.type).equals(ChannelType.TCP);

            await clientTransport.close();
            await serverTransport.close();
        });

        it("reuses existing connection for same address", async () => {
            const host1 = simulator.addHost(1);
            const host2 = simulator.addHost(2);

            const serverTransport = await TcpTransport.create({
                network: host1,
                listeningPort: SERVER_PORT,
            });
            const clientTransport = await TcpTransport.create({ network: host2 });

            const channel1 = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });
            const channel2 = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });

            expect(channel1).equals(channel2);

            await clientTransport.close();
            await serverTransport.close();
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

            const channel1 = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });
            const channel2 = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::2",
                port: SERVER_PORT,
            });

            expect(channel1).not.equals(channel2);

            await clientTransport.close();
            await server1.close();
            await server2.close();
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
            await clientTransport.openChannel({ type: "tcp", ip: "abcd::1", port: SERVER_PORT });

            expect(connected).length(1);
            expect(connected[0]).instanceof(TcpConnection);

            await clientTransport.close();
            await serverTransport.close();
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
            const channel = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });

            const payload = Bytes.fromHex("deadbeef");
            await channel.send(payload);

            expect(received).length(1);
            expect(Bytes.toHex(received[0].data)).equals("deadbeef");

            await clientTransport.close();
            await serverTransport.close();
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
            const channel = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });

            // Close the client-side channel, which should trigger disconnect on server
            await channel.close();

            expect(disconnected).length(1);

            await clientTransport.close();
            await serverTransport.close();
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
            const channel = await clientTransport.openChannel({
                type: "tcp",
                ip: "abcd::1",
                port: SERVER_PORT,
            });

            // Both transports should close without error
            await serverTransport.close();
            await clientTransport.close();

            // Sending after close should fail
            await expect(channel.send(Bytes.fromHex("ff"))).rejected;
        });
    });
});
