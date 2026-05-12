/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/general";
import * as assert from "node:assert";
import * as net from "node:net";
import { NodeJsNetwork } from "../../src/net/NodeJsNetwork.js";
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

    it("concurrent close calls share one teardown promise", async () => {
        const { clientSocket, rawServer } = await connectClient();
        try {
            let endCount = 0;
            rawServer.on("end", () => {
                endCount++;
            });

            const [a, b, c] = await Promise.all([clientSocket.close(), clientSocket.close(), clientSocket.close()]);

            assert.equal(a, undefined);
            assert.equal(b, undefined);
            assert.equal(c, undefined);
            // The single underlying socket end should produce at most one "end" event on the peer.
            // (Some platforms may not deliver it before the server destroys; assertion is upper-bound.)
            assert.ok(endCount <= 1, `expected ≤1 server-side "end" event, got ${endCount}`);
        } finally {
            rawServer.destroy();
        }
    });

    describe("connectTcp abort handling", () => {
        it("rejects immediately when abort signal is pre-fired", async () => {
            const network = new NodeJsNetwork();
            const controller = new AbortController();
            controller.abort();

            await assert.rejects(network.connectTcp("127.0.0.1", serverPort, { abort: controller.signal }), /aborted/i);
        });

        it("destroys the socket and rejects when abort fires during connect", async () => {
            const network = new NodeJsNetwork();
            const controller = new AbortController();

            // TEST-NET-1 (RFC 5737) — guaranteed non-routable; SYN will hang until aborted.
            const connectPromise = network.connectTcp("192.0.2.1", 5540, {
                abort: controller.signal,
                timeout: 10_000,
            });
            setImmediate(() => controller.abort());

            await assert.rejects(connectPromise, /aborted/i);
        });
    });

    it("close after peer-initiated close completes without hanging", async () => {
        const { clientSocket, rawServer } = await connectClient();

        // Trigger close from peer side and wait for it to propagate to the client wrapper.
        const peerClosed = new Promise<void>(resolve => {
            clientSocket.onClose(() => resolve());
        });
        rawServer.end();
        rawServer.destroy();
        await peerClosed;

        // Awaiting close() must resolve promptly even though the underlying socket already emitted "close".
        await Promise.race([
            clientSocket.close(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("close() hung")), 1000)),
        ]);
    });
});
