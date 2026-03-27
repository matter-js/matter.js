/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType } from "#net/Channel.js";
import { MockTcpSocket } from "#net/mock/MockTcpSocket.js";
import { NetworkSimulator } from "#net/mock/NetworkSimulator.js";
import type { TcpSocket } from "#net/tcp/TcpSocket.js";
import { Bytes } from "#util/Bytes.js";

describe("MockTcpSocket", () => {
    it("sends data between paired sockets", async () => {
        const [client, server] = MockTcpSocket.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);

        const received: Bytes[] = [];
        server.onData(data => received.push(data));

        await client.send(Bytes.fromHex("deadbeef"));

        expect(received).length(1);
        expect(Bytes.toHex(received[0])).equals("deadbeef");

        await client.close();
    });

    it("sends data in both directions", async () => {
        const [client, server] = MockTcpSocket.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);

        const clientReceived: Bytes[] = [];
        const serverReceived: Bytes[] = [];
        client.onData(data => clientReceived.push(data));
        server.onData(data => serverReceived.push(data));

        await client.send(Bytes.fromHex("aa"));
        await server.send(Bytes.fromHex("bb"));

        expect(serverReceived).length(1);
        expect(Bytes.toHex(serverReceived[0])).equals("aa");
        expect(clientReceived).length(1);
        expect(Bytes.toHex(clientReceived[0])).equals("bb");

        await client.close();
        await server.close();
    });

    it("propagates close to peer", async () => {
        const [client, server] = MockTcpSocket.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);

        let serverClosed = false;
        server.onClose(() => {
            serverClosed = true;
        });

        await client.close();

        expect(serverClosed).true;
    });

    it("exposes correct addresses and ports", async () => {
        const [client, server] = MockTcpSocket.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);

        expect(client.remoteAddress).equals("5.6.7.8");
        expect(client.remotePort).equals(6000);
        expect(client.localPort).equals(5000);

        expect(server.remoteAddress).equals("1.2.3.4");
        expect(server.remotePort).equals(5000);
        expect(server.localPort).equals(6000);

        await client.close();
        await server.close();
    });

    it("throws on send after close", async () => {
        const [client] = MockTcpSocket.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);
        await client.close();

        let threw = false;
        try {
            await client.send(Bytes.fromHex("ff"));
        } catch {
            threw = true;
        }
        expect(threw).true;
    });
});

describe("MockTcpServer", () => {
    it("accepts connections via MockNetwork.connectTcp", async () => {
        const simulator = new NetworkSimulator();
        const hostA = simulator.addHost(1);
        const hostB = simulator.addHost(2);

        const server = await hostB.createTcpServer({ listeningPort: 5540 });

        let accepted: TcpSocket | undefined;
        server.onConnection(socket => {
            accepted = socket;
        });

        const clientSocket = await hostA.connectTcp("10.10.10.2", 5540);

        expect(accepted).not.undefined;
        // defaultRoute returns the first IP (IPv6 in NetworkSimulator)
        expect(clientSocket.remoteAddress).equals("abcd::2");
        expect(clientSocket.remotePort).equals(5540);
        expect(accepted!.remoteAddress).equals("abcd::1");

        await clientSocket.close();
        await accepted!.close();
        await server.close();
    });

    it("transfers data end-to-end", async () => {
        const simulator = new NetworkSimulator();
        const hostA = simulator.addHost(1);
        const hostB = simulator.addHost(2);

        const server = await hostB.createTcpServer({ listeningPort: 5540 });

        let serverSocket: TcpSocket | undefined;
        server.onConnection(socket => {
            serverSocket = socket;
        });

        const clientSocket = await hostA.connectTcp("10.10.10.2", 5540);

        // Client -> Server
        const serverReceived: Bytes[] = [];
        serverSocket!.onData(data => serverReceived.push(data));
        await clientSocket.send(Bytes.fromHex("cafe"));
        expect(serverReceived).length(1);
        expect(Bytes.toHex(serverReceived[0])).equals("cafe");

        // Server -> Client
        const clientReceived: Bytes[] = [];
        clientSocket.onData(data => clientReceived.push(data));
        await serverSocket!.send(Bytes.fromHex("babe"));
        expect(clientReceived).length(1);
        expect(Bytes.toHex(clientReceived[0])).equals("babe");

        await clientSocket.close();
        await serverSocket!.close();
        await server.close();
    });

    it("propagates close between connected sockets", async () => {
        const simulator = new NetworkSimulator();
        const hostA = simulator.addHost(1);
        const hostB = simulator.addHost(2);

        const server = await hostB.createTcpServer({ listeningPort: 5540 });

        let serverSocket: TcpSocket | undefined;
        server.onConnection(socket => {
            serverSocket = socket;
        });

        const clientSocket = await hostA.connectTcp("10.10.10.2", 5540);

        let serverSideClosed = false;
        serverSocket!.onClose(() => {
            serverSideClosed = true;
        });

        await clientSocket.close();

        expect(serverSideClosed).true;

        await server.close();
    });
});

describe("MockNetwork TCP support", () => {
    it("reports TCP support", () => {
        const simulator = new NetworkSimulator();
        const host = simulator.addHost(1);
        expect(host.supports(ChannelType.TCP, "10.10.10.1")).true;
        expect(host.supports(ChannelType.UDP, "10.10.10.1")).true;
    });

    it("throws when no server is listening", async () => {
        const simulator = new NetworkSimulator();
        const hostA = simulator.addHost(1);
        simulator.addHost(2);

        let threw = false;
        try {
            await hostA.connectTcp("10.10.10.2", 9999);
        } catch {
            threw = true;
        }
        expect(threw).true;
    });

    it("throws when target host does not exist", async () => {
        const simulator = new NetworkSimulator();
        const hostA = simulator.addHost(1);

        let threw = false;
        try {
            await hostA.connectTcp("10.10.10.99", 5540);
        } catch {
            threw = true;
        }
        expect(threw).true;
    });
});
