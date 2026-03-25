/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Logger,
    NetworkError,
    TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
    Transport,
    type TcpServerOptions,
    type TcpServerSocket,
    type TcpSocket,
} from "@matter/general";
import { createServer, type Server as RnServer, type Socket as RnSocket } from "react-native-tcp-socket";
import { TcpSocketReactNative } from "./TcpSocketReactNative.js";

const logger = Logger.get("TcpServerReactNative");

/**
 * React Native implementation of {@link TcpServerSocket}.
 * Wraps a `react-native-tcp-socket` Server.
 */
export class TcpServerReactNative implements TcpServerSocket {
    readonly #server: RnServer;
    readonly #port: number;

    static async create(options: TcpServerOptions = {}): Promise<TcpServerReactNative> {
        const server = createServer({
            keepAlive: true,
            keepAliveInitialDelay: TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
        });

        return new Promise<TcpServerReactNative>((resolve, reject) => {
            const handleError = (error: Error) => {
                server.removeListener("error", handleError);
                reject(new NetworkError(error.message));
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
                resolve(new TcpServerReactNative(server, port));
            });
        });
    }

    private constructor(server: RnServer, port: number) {
        this.#server = server;
        this.#port = port;
    }

    get port(): number {
        return this.#port;
    }

    onConnection(listener: (socket: TcpSocket) => void): Transport.Listener {
        const handler = (socket: RnSocket) => {
            listener(new TcpSocketReactNative(socket));
        };
        this.#server.on("connection", handler);
        return {
            close: async () => {
                this.#server.off("connection", handler);
            },
        };
    }

    async close(): Promise<void> {
        return new Promise<void>(resolve => {
            this.#server.close(() => resolve());
        });
    }
}
