/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Transport } from "../Transport.js";
import type { TcpConnection, TcpListener, TcpListenerOptions } from "../tcp/TcpConnection.js";
import type { MockNetwork } from "./MockNetwork.js";
import { MockTcpConnection } from "./MockTcpConnection.js";

/**
 * Mock TCP server for testing.  Registers itself with a {@link MockNetwork} so
 * that {@link MockNetwork.connectTcp} can route incoming connections.
 */
export class MockTcpListener implements TcpListener {
    readonly port: number;
    readonly #host: MockNetwork;
    readonly #connectionListeners = new Set<(socket: TcpConnection) => void>();

    constructor(host: MockNetwork, options: TcpListenerOptions) {
        this.port = options.listeningPort ?? 1024 + Math.floor(Math.random() * 64511);
        this.#host = host;
        host.registerTcpListener(this);
    }

    /**
     * Called by {@link MockNetwork.connectTcp} when a client connects.
     * Creates a socket pair, notifies connection listeners with the server-side
     * socket, and returns the client-side socket.
     */
    accept(clientAddress: string, clientPort: number): MockTcpConnection {
        const [clientSocket, serverSocket] = MockTcpConnection.createPair(
            clientAddress,
            clientPort,
            this.#host.defaultRoute,
            this.port,
        );

        for (const listener of this.#connectionListeners) {
            listener(serverSocket);
        }

        return clientSocket;
    }

    onConnection(listener: (socket: TcpConnection) => void): Transport.Listener {
        this.#connectionListeners.add(listener);
        return {
            close: async () => {
                this.#connectionListeners.delete(listener);
            },
        };
    }

    async close(): Promise<void> {
        this.#host.unregisterTcpListener(this.port);
    }
}
