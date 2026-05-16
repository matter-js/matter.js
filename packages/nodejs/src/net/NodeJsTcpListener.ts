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
    TcpConnection,
    tcpErrorFrom,
    TcpListener,
    TcpListenerOptions,
    Transport,
    withTimeout,
} from "@matter/general";
import { createServer, type Server, type Socket } from "node:net";
import { NodeJsTcpConnection } from "./NodeJsTcpConnection.js";

const logger = Logger.get("NodeJsTcpListener");

/** Timeout for server listen to complete. */
const TCP_LISTEN_TIMEOUT = Seconds(10);

/** Timeout for server close to complete; on expiry we proceed regardless to keep shutdown bounded. */
const TCP_LISTENER_CLOSE_TIMEOUT = Seconds(2);

function serverPort(server: Server): number {
    const addr = server.address();
    if (addr === null || typeof addr === "string") {
        throw new NetworkError(`TCP server address is not an IP address: ${addr}`);
    }
    return addr.port;
}

/**
 * Node.js implementation of the {@link TcpListener} interface.
 * Wraps a `net.Server` that accepts incoming TCP connections.
 */
export class NodeJsTcpListener implements TcpListener {
    readonly #server: Server;
    readonly #activeSockets = new Set<Socket>();

    static async create(options: TcpListenerOptions = {}): Promise<NodeJsTcpListener> {
        const { listeningPort, listeningAddress } = options;

        const server = createServer({
            keepAlive: true,
            keepAliveInitialDelay: TCP_KEEP_ALIVE_INITIAL_DELAY_MS,
        });

        const listening = new Promise<void>((resolve, reject) => {
            const handleError = (error: Error) => {
                server.removeListener("error", handleError);
                reject(tcpErrorFrom(error));
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

        return new NodeJsTcpListener(server);
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

    onConnection(listener: (socket: TcpConnection) => void): Transport.Listener {
        const handler = (socket: Socket) => {
            listener(new NodeJsTcpConnection(socket));
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

        // Resolve with the optional error rather than reject so the same promise can outlive a timeout fallback
        // without producing an unhandled rejection or duplicate error log paths.
        const closing = new Promise<Error | undefined>(resolve => {
            this.#server.close(error => resolve(error ?? undefined));
        });

        try {
            const error = await withTimeout(TCP_LISTENER_CLOSE_TIMEOUT, closing);
            if (error) {
                logger.warn("TCP listener close error:", error);
            }
        } catch (error) {
            if (!(error instanceof PromiseTimeoutError)) {
                logger.debug("Unexpected error awaiting TCP listener close, rethrowing:", error);
                throw error;
            }
            logger.info("TCP listener close did not complete within timeout, unrefing server");
            this.#server.unref();
            // The close callback may still fire later; surface any error it carries.
            void closing.then(closeError => {
                if (closeError) {
                    logger.warn("TCP listener close error after timeout:", closeError);
                }
            });
        }
    }
}
