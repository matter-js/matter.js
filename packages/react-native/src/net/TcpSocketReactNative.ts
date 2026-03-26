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
    type TcpSocket,
    withTimeout,
} from "@matter/general";
import { createConnection, type Socket as RnSocket } from "react-native-tcp-socket";

/** Connection timeout as Duration for withTimeout. */
const TCP_CONNECT_TIMEOUT = Seconds(TCP_CONNECTION_TIMEOUT_MS / 1000);

/**
 * React Native implementation of {@link TcpSocket}.
 * Wraps a `react-native-tcp-socket` Socket.
 */
export class TcpSocketReactNative implements TcpSocket {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;
    readonly #socket: RnSocket;

    constructor(socket: RnSocket) {
        this.#socket = socket;
        this.remoteAddress = socket.remoteAddress ?? "";
        this.remotePort = socket.remotePort ?? 0;
        this.localPort = socket.localPort ?? 0;

        socket.setNoDelay(true);
        socket.setKeepAlive(true, TCP_KEEP_ALIVE_INITIAL_DELAY_MS);
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

    onData(listener: (data: Bytes) => void): Transport.Listener {
        const handler = (data: Buffer | string) => {
            const bytes = typeof data === "string" ? Buffer.from(data) : data;
            listener(new Uint8Array(bytes));
        };
        this.#socket.on("data", handler);
        return {
            close: async () => {
                this.#socket.off("data", handler);
            },
        };
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
        this.#socket.end();
    }
}

/** Create a client TCP connection using react-native-tcp-socket. */
export function connectReactNativeTcp(host: string, port: number): Promise<TcpSocketReactNative> {
    let socket: RnSocket | undefined;

    const connected = new Promise<TcpSocketReactNative>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (!settled) {
                settled = true;
                fn();
            }
        };

        socket = createConnection({ host, port }, () => {
            settle(() => resolve(new TcpSocketReactNative(socket!)));
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
