/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, NetworkError, Seconds, TCP_KEEP_ALIVE_INITIAL_DELAY_MS, TcpSocket, Transport, withTimeout } from "@matter/general";
import type { Socket } from "node:net";

/** Time to wait for graceful close before force-destroying the socket. */
const TCP_CLOSE_TIMEOUT = Seconds(5);

/**
 * Node.js implementation of the {@link TcpSocket} interface.
 * Wraps a connected `net.Socket`.
 */
export class NodeJsTcpSocket implements TcpSocket {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;

    readonly #socket: Socket;

    constructor(socket: Socket) {
        this.#socket = socket;

        socket.setNoDelay(true);
        socket.setKeepAlive(true, TCP_KEEP_ALIVE_INITIAL_DELAY_MS);

        this.remoteAddress = socket.remoteAddress ?? "";
        this.remotePort = socket.remotePort ?? 0;
        this.localPort = socket.localPort ?? 0;
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

    onData(listener: (data: Bytes) => void): Transport.Listener {
        const handler = (data: Buffer) => {
            listener(new Uint8Array(data));
        };
        this.#socket.on("data", handler);
        return {
            close: async () => {
                this.#socket.removeListener("data", handler);
            },
        };
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

        const closed = new Promise<void>(resolve => {
            this.#socket.once("close", () => resolve());
            this.#socket.end();
        });

        await withTimeout(TCP_CLOSE_TIMEOUT, closed, () => {
            // Graceful close did not complete in time — force destroy
            this.#socket.destroy();
        });
    }
}
