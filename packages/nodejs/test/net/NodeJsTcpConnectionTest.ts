/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import * as assert from "node:assert";
import * as net from "node:net";
import { NodeJsTcpConnection } from "../../src/net/NodeJsTcpConnection.js";

describe("NodeJsTcpConnection", () => {
    let server: net.Server;
    let serverPort: number;

    beforeEach(done => {
        server = net.createServer();
        server.listen(0, "127.0.0.1", () => {
            serverPort = (server.address() as net.AddressInfo).port;
            done();
        });
    });

    afterEach(done => {
        server.close(() => done());
    });

    function connectClient(): Promise<{
        clientSocket: NodeJsTcpConnection;
        rawClient: net.Socket;
        rawServer: net.Socket;
    }> {
        return new Promise((resolve, reject) => {
            let rawServer: net.Socket | undefined;
            let connected = false;

            const tryResolve = () => {
                if (rawServer && connected) {
                    resolve({ clientSocket: new NodeJsTcpConnection(rawClient), rawClient, rawServer });
                }
            };

            server.once("connection", s => {
                rawServer = s;
                tryResolve();
            });

            const rawClient = net.createConnection(serverPort, "127.0.0.1", () => {
                connected = true;
                tryResolve();
            });
            rawClient.on("error", reject);
        });
    }

    it("exposes remote address and port", async () => {
        const { clientSocket, rawServer } = await connectClient();
        try {
            assert.equal(clientSocket.remoteAddress, "127.0.0.1");
            assert.equal(clientSocket.remotePort, serverPort);
            assert.ok(clientSocket.localPort > 0);
        } finally {
            await clientSocket.close();
            rawServer.destroy();
        }
    });

    it("sends data to peer", async () => {
        const { clientSocket, rawServer } = await connectClient();
        try {
            const received = new Promise<Buffer>(resolve => {
                rawServer.once("data", resolve);
            });

            await clientSocket.send(Bytes.fromString("hello"));
            const data = await received;
            assert.equal(data.toString(), "hello");
        } finally {
            await clientSocket.close();
            rawServer.destroy();
        }
    });

    it("receives data via async iteration", async () => {
        const { clientSocket, rawServer } = await connectClient();
        try {
            rawServer.write("world");

            const iter = clientSocket[Symbol.asyncIterator]();
            const result = await iter.next();
            assert.equal(result.done, false);
            assert.equal(Bytes.toString(result.value), "world");
        } finally {
            await clientSocket.close();
            rawServer.destroy();
        }
    });

    it("terminates iteration on close", async () => {
        const { clientSocket, rawServer } = await connectClient();
        try {
            const iter = clientSocket[Symbol.asyncIterator]();
            await clientSocket.close();

            const result = await iter.next();
            assert.equal(result.done, true);
        } finally {
            await clientSocket.close();
            rawServer.destroy();
        }
    });

    it("onClose fires when peer disconnects", async () => {
        const { clientSocket, rawServer } = await connectClient();
        const closed = new Promise<void>(resolve => {
            clientSocket.onClose(() => resolve());
        });

        rawServer.end();
        await closed;
        await clientSocket.close();
    });

    it("onError fires on error conditions", async () => {
        const { clientSocket, rawClient, rawServer } = await connectClient();
        const errored = new Promise<Error>(resolve => {
            clientSocket.onError(error => resolve(error));
        });

        // Emit an error directly on the underlying socket
        rawClient.emit("error", new Error("test error"));

        const error = await errored;
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes("test error"));

        rawServer.destroy();
        await clientSocket.close();
    });

    it("close resolves for already destroyed socket", async () => {
        const { clientSocket, rawServer } = await connectClient();
        rawServer.destroy();
        // Wait for destruction to propagate
        await new Promise(resolve => setTimeout(resolve, 50));
        // Should not hang
        await clientSocket.close();
    });
});
