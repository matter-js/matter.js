/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Logger,
    NetworkError,
    Seconds,
    TCP_CONNECTION_TIMEOUT_MS,
    TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
    tcpErrorFrom,
    Transport,
    withTimeout,
    type TcpConnection,
} from "@matter/general";
import { createConnection, type Socket as RnSocket } from "react-native-tcp-socket";

const logger = Logger.get("TcpConnectionReactNative");

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
    #closePromise?: Promise<void>;
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

    send(data: Bytes): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.#socket.write(Buffer.from(Bytes.of(data)), (error?: Error) => {
                if (error) {
                    reject(tcpErrorFrom(error));
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
        const handler = (error: Error) => listener(tcpErrorFrom(error));
        this.#socket.on("error", handler);
        return {
            close: async () => {
                this.#socket.off("error", handler);
            },
        };
    }

    close(): Promise<void> {
        // Memoize so concurrent callers share one teardown — each `await close()` waits for actual shutdown.
        return (this.#closePromise ??= this.#doClose());
    }

    async #doClose(): Promise<void> {
        // react-native-tcp-socket's exported Socket type does not surface `destroyed`, so we rely on
        // #ended (set by the constructor's "close"/"error" handlers) to detect external closure.
        const alreadyClosed = this.#ended;
        this.#ended = true;
        this.#waiter?.({ value: undefined as unknown as Bytes, done: true });
        this.#waiter = undefined;

        // Already closed externally; a fresh "close" listener wouldn't fire and would stall #closePromise.
        if (alreadyClosed) {
            return;
        }

        // react-native-tcp-socket Socket type lacks `once`; install a named handler and detach it manually.
        let onClose: (() => void) | undefined;
        try {
            const closed = new Promise<void>(resolve => {
                onClose = () => resolve();
                this.#socket.on("close", onClose);
                this.#socket.end();
            });
            await withTimeout(Seconds(5), closed, () => {
                this.#socket.destroy();
            });
        } catch (error) {
            logger.warn(`Error closing TCP connection ${this.remoteAddress}:${this.remotePort}:`, error);
            try {
                this.#socket.destroy();
            } catch (destroyError) {
                logger.debug(`Error destroying TCP socket ${this.remoteAddress}:${this.remotePort}:`, destroyError);
            }
        } finally {
            if (onClose) {
                this.#socket.off("close", onClose);
            }
        }
    }
}

/** Create a client TCP connection using react-native-tcp-socket. */
export function connectReactNativeTcp(
    host: string,
    port: number,
    abort?: AbortSignal,
    timeoutMs?: number,
): Promise<TcpConnectionReactNative> {
    if (abort?.aborted) {
        return Promise.reject(new NetworkError("TCP connect aborted"));
    }
    let socket: RnSocket | undefined;
    let onAbort: (() => void) | undefined;

    const connected = new Promise<TcpConnectionReactNative>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
            if (!settled) {
                settled = true;
                if (onAbort) abort?.removeEventListener("abort", onAbort);
                fn();
            }
        };

        socket = createConnection({ host, port }, () => {
            settle(() => resolve(new TcpConnectionReactNative(socket!)));
        });

        socket.on("error", (err: Error) => {
            settle(() => reject(tcpErrorFrom(err)));
        });

        onAbort = () =>
            settle(() => {
                socket?.destroy();
                reject(new NetworkError("TCP connect aborted"));
            });
        abort?.addEventListener("abort", onAbort, { once: true });
    });

    const timeout = timeoutMs !== undefined ? Seconds(timeoutMs / 1000) : TCP_CONNECT_TIMEOUT;
    return withTimeout(timeout, connected, () => {
        socket?.destroy();
        throw new NetworkError("TCP connection timeout");
    }).finally(() => {
        // withTimeout's timeout path doesn't run settle; detach the abort listener defensively.
        if (onAbort) abort?.removeEventListener("abort", onAbort);
    });
}
