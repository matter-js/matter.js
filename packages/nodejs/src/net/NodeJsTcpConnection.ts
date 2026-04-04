/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    NetworkError,
    Seconds,
    TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
    TcpConnection,
    Transport,
    withTimeout,
} from "@matter/general";
import type { Socket } from "node:net";

/** Time to wait for graceful close before force-destroying the socket. */
const TCP_CLOSE_TIMEOUT = Seconds(5);

/**
 * Node.js implementation of the {@link TcpConnection} interface.
 * Wraps a connected `net.Socket`.
 */
export class NodeJsTcpConnection implements TcpConnection {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;

    readonly #socket: Socket;
    #ended = false;

    /** Queued chunks waiting for the async iterator to consume. */
    #chunks = new Array<Uint8Array>();
    /** Resolver for a pending iterator next() call waiting for data. */
    #waiter?: (value: IteratorResult<Bytes>) => void;

    constructor(socket: Socket) {
        this.#socket = socket;

        socket.setNoDelay(true);
        socket.setKeepAlive(true, TCP_KEEP_ALIVE_INITIAL_DELAY_MS);

        this.remoteAddress = socket.remoteAddress ?? "";
        this.remotePort = socket.remotePort ?? 0;
        this.localPort = socket.localPort ?? 0;

        socket.on("data", (data: Buffer) => {
            const chunk = new Uint8Array(data);
            if (this.#waiter) {
                const resolve = this.#waiter;
                this.#waiter = undefined;
                resolve({ value: chunk, done: false });
            } else {
                this.#chunks.push(chunk);
                // Pause when queue grows to apply backpressure
                if (this.#chunks.length > 1) {
                    socket.pause();
                }
            }
        });

        socket.on("close", () => {
            this.#ended = true;
            this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
            this.#waiter = undefined;
        });

        socket.on("error", (_error: Error) => {
            this.#ended = true;
            this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
            this.#waiter = undefined;
        });
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: () => {
                if (this.#chunks.length > 0) {
                    const chunk = this.#chunks.shift()!;
                    if (this.#chunks.length === 0) {
                        // Queue drained — resume the socket for more data
                        this.#socket.resume();
                    }
                    return Promise.resolve({ value: chunk, done: false });
                }

                if (this.#ended) {
                    return Promise.resolve({ value: undefined as unknown as Bytes, done: true });
                }

                // Resume socket and wait for next chunk
                this.#socket.resume();
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#waiter = resolve;
                });
            },
        };
    }

    send(data: Bytes): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.#socket.write(Bytes.of(data), error => {
                if (error) {
                    reject(new NetworkError(error.message));
                } else {
                    resolve();
                }
            });
        });
    }

    onClose(listener: () => void): Transport.Listener {
        this.#socket.on("close", listener);
        return {
            close: async () => {
                this.#socket.removeListener("close", listener);
            },
        };
    }

    onError(listener: (error: Error) => void): Transport.Listener {
        const handler = (error: Error) => {
            listener(new NetworkError(error.message));
        };
        this.#socket.on("error", handler);
        return {
            close: async () => {
                this.#socket.removeListener("error", handler);
            },
        };
    }

    async close(): Promise<void> {
        if (this.#socket.destroyed) {
            return;
        }

        this.#ended = true;
        this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
        this.#waiter = undefined;

        const closed = new Promise<void>(resolve => {
            this.#socket.once("close", () => resolve());
            this.#socket.end();
        });

        await withTimeout(TCP_CLOSE_TIMEOUT, closed, () => {
            this.#socket.destroy();
        });
    }
}
