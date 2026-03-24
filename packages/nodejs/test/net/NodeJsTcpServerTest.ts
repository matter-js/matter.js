/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import * as assert from "node:assert";
import * as net from "node:net";
import { NodeJsTcpServer } from "../../src/net/NodeJsTcpServer.js";

describe("NodeJsTcpServer", () => {
    it("accepts connections and reports correct port", async () => {
        const server = await NodeJsTcpServer.create({ listeningAddress: "127.0.0.1" });
        try {
            assert.ok(server.port > 0);

            const connected = new Promise<void>(resolve => {
                server.onConnection(socket => {
                    assert.ok(socket.remoteAddress);
                    assert.ok(socket.remotePort > 0);
                    socket.close();
                    resolve();
                });
            });

            const client = net.createConnection(server.port, "127.0.0.1");
            await connected;
            client.destroy();
        } finally {
            await server.close();
        }
    });

    it("wraps accepted sockets as NodeJsTcpSocket with data flow", async () => {
        const server = await NodeJsTcpServer.create({ listeningAddress: "127.0.0.1" });
        try {
            const received = new Promise<string>(resolve => {
                server.onConnection(socket => {
                    socket.onData(data => {
                        resolve(Bytes.toString(data));
                        socket.close();
                    });
                });
            });

            const client = net.createConnection(server.port, "127.0.0.1", () => {
                client.write("hello from client");
            });

            const data = await received;
            assert.equal(data, "hello from client");
            client.destroy();
        } finally {
            await server.close();
        }
    });

    it("stops accepting after close", async () => {
        const server = await NodeJsTcpServer.create({ listeningAddress: "127.0.0.1" });
        const port = server.port;

        let connectionSeen = false;
        server.onConnection(() => {
            connectionSeen = true;
        });

        await server.close();

        // Attempt to connect should fail
        await new Promise<void>((resolve, reject) => {
            const client = net.createConnection(port, "127.0.0.1");
            client.on("error", () => {
                resolve();
            });
            client.on("connect", () => {
                client.destroy();
                reject(new Error("Should not have connected"));
            });
            setTimeout(() => resolve(), 500);
        });

        assert.equal(connectionSeen, false);
    });

    it("onConnection listener can be removed", async () => {
        const server = await NodeJsTcpServer.create({ listeningAddress: "127.0.0.1" });
        try {
            let connectionCount = 0;
            const listener = server.onConnection(() => {
                connectionCount++;
            });
            await listener.close();

            // Connect a client
            const client = net.createConnection(server.port, "127.0.0.1");
            await new Promise(resolve => setTimeout(resolve, 100));
            client.destroy();

            assert.equal(connectionCount, 0);
        } finally {
            await server.close();
        }
    });

    it("uses OS-assigned port when listeningPort is 0", async () => {
        const server = await NodeJsTcpServer.create({ listeningPort: 0, listeningAddress: "127.0.0.1" });
        try {
            assert.ok(server.port > 0);
        } finally {
            await server.close();
        }
    });
});
