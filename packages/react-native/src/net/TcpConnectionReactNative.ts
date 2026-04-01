/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    NetworkError,
    Seconds,
    TCP_CONNECTION_TIMEOUT_MS,
    TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
    Transport,
    withTimeout,
    type TcpConnection,
} from "@matter/general";
import { createConnection, type Socket as RnSocket } from "react-native-tcp-socket";

/** Connection timeout as Duration for withTimeout. */
const TCP_CONNECT_TIMEOUT = Seconds(TCP_CONNECTION_TIMEOUT_MS / 1000);

/**
 * React Native implementation of {@link TcpConnection}.
 * Wraps a `react-native-tcp-socket` Socket.
 */
export class TcpConnectionReactNative implements TcpConnection {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;
    readonly #socket: RnSocket;
    #ended = false;
    #chunks = new Array<Bytes>();
    #waiter?: (value: IteratorResult<Bytes>) => void;

    constructor(socket: RnSocket) {
        this.#socket = socket;
        this.remoteAddress = socket.remoteAddress ?? "";
        this.remotePort = socket.remotePort ?? 0;
        this.localPort = socket.localPort ?? 0;

        socket.setNoDelay(true);
        socket.setKeepAlive(true, TCP_KEEP_ALIVE_INITIAL_DELAY_MS);

        socket.on("data", (data: Buffer | string) => {
            const bytes = typeof data === "string" ? Buffer.from(data) : new Uint8Array(data);
            if (this.#waiter) {
                const resolve = this.#waiter;
                this.#waiter = undefined;
                resolve({ value: bytes, done: false });
            } else {
                this.#chunks.push(bytes);
            }
        });

        socket.on("close", () => {
            this.#ended = true;
            this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
            this.#waiter = undefined;
        });

        socket.on("error", () => {
            this.#ended = true;
            this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
            this.#waiter = undefined;
        });
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: () => {
                if (this.#chunks.length > 0) {
                    return Promise.resolve({ value: this.#chunks.shift()!, done: false });
                }
                if (this.#ended) {
                    return Promise.resolve({ value: undefined as unknown as Bytes, done: true });
                }
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#waiter = resolve;
                });
            },
        };
    }

    /** @deprecated Prefer async iteration. */
    onData(listener: (data: Bytes) => void): Transport.Listener {
        const handler = (data: Buffer | string) => {
            const bytes = typeof data === "string" ? Buffer.from(data) : new Uint8Array(data);
            listener(bytes);
        };
        this.#socket.on("data", handler);
        return {
            close: async () => {
                this.#socket.off("data", handler);
            },
        };
    }

    send(data: Bytes): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.#socket.write(Buffer.from(Bytes.of(data)), (error?: Error) => {
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
                this.#socket.off("close", listener);
            },
        };
    }

    onError(listener: (error: Error) => void): Transport.Listener {
        const handler = (error: Error) => listener(new NetworkError(error.message));
        this.#socket.on("error", handler);
        return {
            close: async () => {
                this.#socket.off("error", handler);
            },
        };
    }

    async close(): Promise<void> {
        this.#ended = true;
        this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
        this.#waiter = undefined;
        this.#socket.end();
    }
}

/** Create a client TCP connection using react-native-tcp-socket. */
export function connectReactNativeTcp(host: string, port: number): Promise<TcpConnectionReactNative> {
    let socket: RnSocket | undefined;

    const connected = new Promise<TcpConnectionReactNative>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (!settled) {
                settled = true;
                fn();
            }
        };

        socket = createConnection({ host, port }, () => {
            settle(() => resolve(new TcpConnectionReactNative(socket!)));
        });

        socket.on("error", (err: Error) => {
            settle(() => reject(new NetworkError(err.message)));
        });
    });

    return withTimeout(TCP_CONNECT_TIMEOUT, connected, () => {
        socket?.destroy();
        throw new NetworkError("TCP connection timeout");
    });
}
