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
 * Mock TCP connection for testing. Two connections are created as a connected pair;
 * data written to one is delivered to the other via async iteration.
 */
export class MockTcpConnection implements TcpConnection {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;

    #peer?: MockTcpConnection;
    readonly #closeListeners = new Set<() => void>();
    readonly #errorListeners = new Set<(error: Error) => void>();
    #closed = false;

    /** Queue for async iteration — chunks waiting to be consumed. */
    #chunks = new Array<Bytes>();
    /** Resolver for a pending next() call waiting for data. */
    #waiter?: (value: IteratorResult<Bytes>) => void;

    private constructor(localPort: number, remoteAddress: string, remotePort: number) {
        this.localPort = localPort;
        this.remoteAddress = remoteAddress;
        this.remotePort = remotePort;
    }

    /**
     * Create a connected pair of mock TCP connections.
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
            throw new Error("Connection is closed");
        }
        const peer = this.#peer;
        if (!peer || peer.#closed) {
            throw new Error("Peer connection is closed");
        }

        // Deliver asynchronously
        await Time.macrotask;

        // Push to peer's iterator queue
        if (peer.#waiter) {
            const resolve = peer.#waiter;
            peer.#waiter = undefined;
            resolve({ value: data, done: false });
        } else {
            peer.#chunks.push(data);
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: () => {
                if (this.#chunks.length > 0) {
                    return Promise.resolve({ value: this.#chunks.shift()!, done: false });
                }
                if (this.#closed) {
                    return Promise.resolve({ value: undefined as unknown as Bytes, done: true });
                }
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#waiter = resolve;
                });
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

        // Terminate iterator
        this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
        this.#waiter = undefined;

        // Notify local close listeners
        for (const listener of this.#closeListeners) {
            listener();
        }

        // Notify peer
        const peer = this.#peer;
        if (peer && !peer.#closed) {
            peer.#closed = true;
            peer.#waiter?.({ value: undefined as unknown as Bytes, done: true });
            peer.#waiter = undefined;
            for (const listener of peer.#closeListeners) {
                listener();
            }
        }
    }
}
