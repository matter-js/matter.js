/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Logger,
    NetworkError,
    PromiseTimeoutError,
    Seconds,
    TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
    tcpErrorFrom,
    Transport,
    withTimeout,
    type TcpConnection,
    type TcpListener,
    type TcpListenerOptions,
} from "@matter/general";
import { createServer, type Server as RnServer, type Socket as RnSocket } from "react-native-tcp-socket";
import { TcpConnectionReactNative } from "./TcpConnectionReactNative.js";

const logger = Logger.get("TcpListenerReactNative");

/** Timeout for server listen to complete. */
const TCP_LISTEN_TIMEOUT = Seconds(10);

/** Timeout for server close to complete; on expiry we proceed regardless to keep shutdown bounded. */
const TCP_CLOSE_TIMEOUT = Seconds(2);

/**
 * React Native implementation of {@link TcpListener}.
 * Wraps a `react-native-tcp-socket` Server.
 */
export class TcpListenerReactNative implements TcpListener {
    readonly #server: RnServer;
    readonly #port: number;
    readonly #activeSockets = new Set<RnSocket>();

    static async create(options: TcpListenerOptions = {}): Promise<TcpListenerReactNative> {
        const server = createServer({
            keepAlive: true,
            keepAliveInitialDelay: TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
        });

        const listening = new Promise<TcpListenerReactNative>((resolve, reject) => {
            const handleError = (error: Error) => {
                server.removeListener("error", handleError);
                reject(tcpErrorFrom(error));
            };
            server.on("error", handleError);
            server.listen({ port: options.listeningPort ?? 0, host: options.listeningAddress ?? "0.0.0.0" }, () => {
                server.removeListener("error", handleError);
                const addr = server.address();
                const port = typeof addr === "object" && addr !== null ? addr.port : 0;
                if (port === 0) {
                    reject(new NetworkError("TCP server failed to obtain a port"));
                    return;
                }
                logger.debug(`TCP server listening on port ${port}`);
                resolve(new TcpListenerReactNative(server, port));
            });
        });

        return withTimeout(TCP_LISTEN_TIMEOUT, listening, () => {
            server.close();
            throw new NetworkError("TCP server listen timeout");
        });
    }

    private constructor(server: RnServer, port: number) {
        this.#server = server;
        this.#port = port;

        server.on("connection", (socket: RnSocket) => {
            this.#activeSockets.add(socket);
            socket.on("close", () => this.#activeSockets.delete(socket));
        });
    }

    get port(): number {
        return this.#port;
    }

    onConnection(listener: (socket: TcpConnection) => void): Transport.Listener {
        const handler = (socket: RnSocket) => {
            listener(new TcpConnectionReactNative(socket));
        };
        this.#server.on("connection", handler);
        return {
            close: async () => {
                this.#server.off("connection", handler);
            },
        };
    }

    async close(): Promise<void> {
        for (const socket of this.#activeSockets) {
            socket.destroy();
        }
        this.#activeSockets.clear();

        const closed = new Promise<void>(resolve => {
            this.#server.close(() => resolve());
        });

        try {
            await withTimeout(TCP_CLOSE_TIMEOUT, closed);
        } catch (error) {
            if (error instanceof PromiseTimeoutError) {
                logger.info("TCP listener close did not complete within timeout");
            } else {
                logger.warn("TCP listener close error:", error);
            }
        }
    }
}
