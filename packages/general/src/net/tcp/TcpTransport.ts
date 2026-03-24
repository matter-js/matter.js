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
import { Bytes } from "#util/Bytes.js";
import { TcpConnection } from "./TcpConnection.js";
import { DEFAULT_MAX_TCP_MESSAGE_SIZE, TcpServerSocket } from "./TcpSocket.js";

const logger = Logger.get("TcpTransport");

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
    readonly #connections = new Map<string, TcpConnection>();
    #server?: TcpServerSocket;
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
            transport.#server = await options.network.createTcpServer({
                listeningPort: options.listeningPort,
                listeningAddress: options.listeningAddress,
            });

            transport.#server.onConnection(socket => {
                const connection = new TcpConnection(socket, transport.#maxMessageSize);
                transport.#registerConnection(connection);

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
        if (address.type !== "tcp") {
            throw new NetworkError(`TcpTransport does not support address type "${address.type}"`);
        }

        const key = `${address.ip}:${address.port}`;
        const existing = this.#connections.get(key);
        if (existing) {
            return existing;
        }

        const socket = await this.#network.connectTcp(address.ip, address.port);
        const connection = new TcpConnection(socket, this.#maxMessageSize);
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

    #registerConnection(connection: TcpConnection): void {
        const { ip, port } = connection.networkAddress;
        const key = `${ip}:${port}`;

        this.#connections.set(key, connection);

        connection.onMessage(data => {
            for (const listener of this.#dataListeners) {
                listener(connection, data);
            }
        });

        connection.onClose(() => {
            this.#connections.delete(key);
            for (const listener of this.#disconnectListeners) {
                listener(connection);
            }
        });

        logger.debug("Registered TCP connection", key);
    }
}
