/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { Channel, ChannelType } from "#net/Channel.js";
import { Network, NetworkError } from "#net/Network.js";
import { ServerAddress } from "#net/ServerAddress.js";
import { ConnectionOrientedTransport, Transport } from "#net/Transport.js";
import { Time } from "#time/Time.js";
import { Seconds } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
import { TcpChannel } from "./TcpChannel.js";
import { DEFAULT_MAX_TCP_MESSAGE_SIZE, TcpListener } from "./TcpConnection.js";

const logger = Logger.get("TcpTransport");

/** Maximum number of TCP connections allowed from the same peer IP address. */
const MAX_CONNECTIONS_PER_PEER_IP = 3;

/** Time to wait for the first data on a new inbound connection before closing it. */
const NEW_CONNECTION_IDLE_TIMEOUT = Seconds(10);

export interface TcpTransportOptions {
    /** Network for creating sockets. */
    network: Network;
    /** Port to listen on (server role). undefined = no server. */
    listeningPort?: number;
    /** Address to bind to. */
    listeningAddress?: string;
    /** Max TCP frame size (header + message). Default DEFAULT_MAX_TCP_MESSAGE_SIZE. */
    maxMessageSize?: number;
}

/**
 * TCP transport layer combining server and client roles with a connection pool.
 *
 * Connections are kept alive as long as sessions reference them. Connection lifecycle is managed
 * by the session layer — when the last session on a connection is closed, the connection should
 * be closed by that layer.
 */
export class TcpTransport implements ConnectionOrientedTransport {
    readonly #connections = new Map<string, TcpChannel>();
    #server?: TcpListener;
    readonly #network: Network;
    readonly #maxMessageSize: number;

    readonly #dataListeners = new Set<(channel: Channel<Bytes>, data: Bytes) => void>();
    readonly #connectListeners = new Set<(channel: Channel<Bytes>) => void>();
    readonly #disconnectListeners = new Set<(channel: Channel<Bytes>) => void>();

    private constructor(options: TcpTransportOptions) {
        this.#network = options.network;
        this.#maxMessageSize = options.maxMessageSize ?? DEFAULT_MAX_TCP_MESSAGE_SIZE;
    }

    /**
     * Create a TcpTransport. Async because server listen is async.
     */
    static async create(options: TcpTransportOptions): Promise<TcpTransport> {
        const transport = new TcpTransport(options);

        if (options.listeningPort !== undefined) {
            transport.#server = await options.network.createTcpListener({
                listeningPort: options.listeningPort,
                listeningAddress: options.listeningAddress,
            });

            transport.#server.onConnection(socket => {
                const connection = new TcpChannel(socket, transport.#maxMessageSize, true);

                if (transport.#countConnectionsFromIp(connection.networkAddress.ip) >= MAX_CONNECTIONS_PER_PEER_IP) {
                    logger.warn(`Rejecting TCP connection from ${connection.name}: too many connections from this IP`);
                    void connection.close();
                    return;
                }

                transport.#registerConnection(connection);

                // Detect and close zombie connections
                const idleTimer = Time.getTimer("tcp-new-connection-idle", NEW_CONNECTION_IDLE_TIMEOUT, () => {
                    if (!receivedData) {
                        logger.debug(`Closing idle TCP connection ${connection.name}: no data received`);
                        void connection.close();
                    }
                });
                idleTimer.start();

                let receivedData = false;
                const dataWatcher = connection.onMessage(() => {
                    receivedData = true;
                    idleTimer.stop();
                    void dataWatcher.close();
                });

                connection.onClose(() => {
                    idleTimer.stop();
                });

                for (const listener of transport.#connectListeners) {
                    listener(connection);
                }
            });
        }

        return transport;
    }

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): Transport.Listener {
        this.#dataListeners.add(listener);
        return {
            close: async () => {
                this.#dataListeners.delete(listener);
            },
        };
    }

    onConnect(listener: (channel: Channel<Bytes>) => void): Transport.Listener {
        this.#connectListeners.add(listener);
        return {
            close: async () => {
                this.#connectListeners.delete(listener);
            },
        };
    }

    onDisconnect(listener: (channel: Channel<Bytes>) => void): Transport.Listener {
        this.#disconnectListeners.add(listener);
        return {
            close: async () => {
                this.#disconnectListeners.delete(listener);
            },
        };
    }

    supports(type: ChannelType, _address?: string): boolean {
        return type === ChannelType.TCP;
    }

    async openChannel(address: ServerAddress): Promise<Channel<Bytes>> {
        if (!ServerAddress.isIp(address)) {
            throw new NetworkError(`TcpTransport does not support non-IP addresses`);
        }

        const key = `${address.ip}:${address.port}`;
        const existing = this.#connections.get(key);
        if (existing) {
            return existing;
        }

        const socket = await this.#network.connectTcp(address.ip, address.port);
        const connection = new TcpChannel(socket, this.#maxMessageSize);
        this.#registerConnection(connection);
        return connection;
    }

    async close(): Promise<void> {
        if (this.#server) {
            await this.#server.close();
            this.#server = undefined;
        }

        const connections = [...this.#connections.values()];
        this.#connections.clear();
        for (const connection of connections) {
            await connection.close();
        }
    }

    #registerConnection(connection: TcpChannel): void {
        const { ip, port } = connection.networkAddress;
        const key = `${ip}:${port}`;

        // Close any existing connection with the same key to prevent orphaning (M-1 fix)
        const existing = this.#connections.get(key);
        if (existing) {
            logger.debug("Replacing existing connection for", key);
            void existing.close();
        }

        this.#connections.set(key, connection);

        connection.onMessage(data => {
            for (const listener of this.#dataListeners) {
                listener(connection, data);
            }
        });

        connection.onClose(() => {
            if (this.#connections.get(key) === connection) {
                this.#connections.delete(key);
            }
            for (const listener of this.#disconnectListeners) {
                listener(connection);
            }
        });

        logger.debug("Registered TCP connection", key);
    }

    /** Count active connections from the given IP address (any port). */
    #countConnectionsFromIp(ip: string): number {
        let count = 0;
        for (const conn of this.#connections.values()) {
            if (conn.networkAddress.ip === ip) {
                count++;
            }
        }
        return count;
    }
}
