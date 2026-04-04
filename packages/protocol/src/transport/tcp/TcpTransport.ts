/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Channel,
    ChannelType,
    ConnectionOrientedTransport,
    DEFAULT_MAX_TCP_MESSAGE_SIZE,
    Logger,
    Network,
    NetworkError,
    Seconds,
    ServerAddress,
    ServerAddressIp,
    TcpListener,
    Time,
    Transport,
} from "@matter/general";
import { TcpChannel } from "./TcpChannel.js";

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
 * TCP transport combining server and client roles with a connection registry.
 *
 * Each connection is 1:1 with a session. Connection lifecycle is managed by the session layer —
 * when the session on a connection is closed, the connection is closed by that layer.
 */
export class TcpTransport implements ConnectionOrientedTransport {
    readonly #channels = new Map<string, TcpChannel>();
    readonly #connecting = new Map<string, Promise<Channel<Bytes>>>();
    #listener?: TcpListener;
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
            transport.#listener = await options.network.createTcpListener({
                listeningPort: options.listeningPort,
                listeningAddress: options.listeningAddress,
            });

            transport.#listener.onConnection(socket => {
                const channel = new TcpChannel(socket, transport.#maxMessageSize, true);

                if (transport.#countConnectionsFromIp(channel.networkAddress.ip) >= MAX_CONNECTIONS_PER_PEER_IP) {
                    logger.warn(`Rejecting TCP connection from ${channel.name}: too many connections from this IP`);
                    void channel.close();
                    return;
                }

                transport.#registerChannel(channel);

                // Detect and close zombie channels
                const idleTimer = Time.getTimer("tcp-new-connection-idle", NEW_CONNECTION_IDLE_TIMEOUT, () => {
                    if (!receivedData) {
                        logger.debug(`Closing idle TCP channel ${channel.name}: no data received`);
                        void channel.close();
                    }
                });
                idleTimer.start();

                let receivedData = false;
                const dataWatcher = channel.onMessage(() => {
                    receivedData = true;
                    idleTimer.stop();
                    void dataWatcher.close();
                });

                channel.onClose(() => {
                    idleTimer.stop();
                });

                for (const listener of transport.#connectListeners) {
                    listener(channel);
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

        // Return existing channel or in-flight connection for this address
        const existing = this.#channels.get(key) ?? this.#connecting.get(key);
        if (existing) {
            return existing;
        }

        // Deduplicate concurrent connect attempts for the same address
        const promise = this.#connect(address);
        this.#connecting.set(key, promise);
        return promise.finally(() => this.#connecting.delete(key));
    }

    async #connect(address: ServerAddressIp): Promise<Channel<Bytes>> {
        const socket = await this.#network.connectTcp(address.ip, address.port);
        const channel = new TcpChannel(socket, this.#maxMessageSize);
        this.#registerChannel(channel);
        return channel;
    }

    async close(): Promise<void> {
        if (this.#listener) {
            await this.#listener.close();
            this.#listener = undefined;
        }

        const channels = [...this.#channels.values()];
        this.#channels.clear();
        for (const channel of channels) {
            await channel.close();
        }
    }

    #registerChannel(channel: TcpChannel): void {
        const { ip, port } = channel.networkAddress;
        const key = `${ip}:${port}`;

        // Close any existing channel with the same key to prevent orphaning
        const existing = this.#channels.get(key);
        if (existing) {
            logger.debug("Replacing existing channel for", key);
            void existing.close();
        }

        this.#channels.set(key, channel);

        channel.onMessage(data => {
            for (const listener of this.#dataListeners) {
                listener(channel, data);
            }
        });

        channel.onClose(() => {
            if (this.#channels.get(key) === channel) {
                this.#channels.delete(key);
            }
            for (const listener of this.#disconnectListeners) {
                listener(channel);
            }
        });

        logger.debug("Registered TCP channel", key);
    }

    /** Count active connections from the given IP address (any port). */
    #countConnectionsFromIp(ip: string): number {
        let count = 0;
        for (const conn of this.#channels.values()) {
            if (conn.networkAddress.ip === ip) {
                count++;
            }
        }
        return count;
    }
}
