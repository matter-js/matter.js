/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time } from "#time/Time.js";
import { Bytes } from "#util/Bytes.js";
import type { Transport } from "../Transport.js";
import type { TcpConnection } from "../tcp/TcpConnection.js";

/**
 * Mock TCP socket for testing.  Two sockets are created as a connected pair;
 * data written to one is delivered to the other's data listeners.
 */
export class MockTcpConnection implements TcpConnection {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;

    #peer?: MockTcpConnection;
    readonly #dataListeners = new Set<(data: Bytes) => void>();
    readonly #closeListeners = new Set<() => void>();
    readonly #errorListeners = new Set<(error: Error) => void>();
    #closed = false;

    private constructor(localPort: number, remoteAddress: string, remotePort: number) {
        this.localPort = localPort;
        this.remoteAddress = remoteAddress;
        this.remotePort = remotePort;
    }

    /**
     * Create a connected pair of mock TCP sockets.
     */
    static createPair(
        clientAddress: string,
        clientPort: number,
        serverAddress: string,
        serverPort: number,
    ): [client: MockTcpConnection, server: MockTcpConnection] {
        const client = new MockTcpConnection(clientPort, serverAddress, serverPort);
        const server = new MockTcpConnection(serverPort, clientAddress, clientPort);
        client.#peer = server;
        server.#peer = client;
        return [client, server];
    }

    async send(data: Bytes): Promise<void> {
        if (this.#closed) {
            throw new Error("Socket is closed");
        }
        const peer = this.#peer;
        if (!peer || peer.#closed) {
            throw new Error("Peer socket is closed");
        }

        // Deliver asynchronously like MockUdpSocket
        await Time.macrotask;

        for (const listener of peer.#dataListeners) {
            listener(data);
        }
    }

    onData(listener: (data: Bytes) => void): Transport.Listener {
        this.#dataListeners.add(listener);
        return {
            close: async () => {
                this.#dataListeners.delete(listener);
            },
        };
    }

    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
    }

    onError(listener: (error: Error) => void): Transport.Listener {
        this.#errorListeners.add(listener);
        return {
            close: async () => {
                this.#errorListeners.delete(listener);
            },
        };
    }

    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;

        // Notify local close listeners
        for (const listener of this.#closeListeners) {
            listener();
        }

        // Notify peer's close listeners
        const peer = this.#peer;
        if (peer && !peer.#closed) {
            peer.#closed = true;
            for (const listener of peer.#closeListeners) {
                listener();
            }
        }
    }
}
