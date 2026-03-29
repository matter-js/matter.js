/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Logger,
    NetworkError,
    Seconds,
    TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
    TcpServer,
    TcpServerOptions,
    TcpSocket,
    Transport,
    withTimeout,
} from "@matter/general";
import { createServer, type Server, type Socket } from "node:net";
import { NodeJsTcpSocket } from "./NodeJsTcpSocket.js";

const logger = Logger.get("NodeJsTcpServer");

/** Timeout for server listen to complete. */
const TCP_LISTEN_TIMEOUT = Seconds(10);

function serverPort(server: Server): number {
    const addr = server.address();
    if (addr === null || typeof addr === "string") {
        throw new NetworkError(`TCP server address is not an IP address: ${addr}`);
    }
    return addr.port;
}

/**
 * Node.js implementation of the {@link TcpServer} interface.
 * Wraps a `net.Server` that accepts incoming TCP connections.
 */
export class NodeJsTcpServer implements TcpServer {
    readonly #server: Server;
    readonly #activeSockets = new Set<Socket>();

    static async create(options: TcpServerOptions = {}): Promise<NodeJsTcpServer> {
        const { listeningPort, listeningAddress } = options;

        const server = createServer({
            keepAlive: true,
            keepAliveInitialDelay: TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
        });

        const listening = new Promise<void>((resolve, reject) => {
            const handleError = (error: Error) => {
                server.removeListener("error", handleError);
                reject(new NetworkError(error.message));
            };
            server.on("error", handleError);
            server.listen(listeningPort ?? 0, listeningAddress, () => {
                server.removeListener("error", handleError);
                resolve();
            });
        });

        await withTimeout(TCP_LISTEN_TIMEOUT, listening, () => {
            server.close();
            throw new NetworkError("TCP server listen timeout");
        });

        const port = serverPort(server);
        logger.debug(`TCP server listening on ${listeningAddress ?? "all interfaces"} port ${port}`);

        return new NodeJsTcpServer(server);
    }

    private constructor(server: Server) {
        this.#server = server;

        server.on("connection", (socket: Socket) => {
            this.#activeSockets.add(socket);
            socket.once("close", () => this.#activeSockets.delete(socket));
        });
    }

    get port(): number {
        return serverPort(this.#server);
    }

    onConnection(listener: (socket: TcpSocket) => void): Transport.Listener {
        const handler = (socket: Socket) => {
            listener(new NodeJsTcpSocket(socket));
        };
        this.#server.on("connection", handler);
        return {
            close: async () => {
                this.#server.removeListener("connection", handler);
            },
        };
    }

    async close(): Promise<void> {
        // Destroy active connections so server.close() can complete
        for (const socket of this.#activeSockets) {
            socket.destroy();
        }
        this.#activeSockets.clear();

        await new Promise<void>((resolve, reject) => {
            this.#server.close(error => (error ? reject(error) : resolve()));
        });
    }
}
