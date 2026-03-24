/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { Transport } from "#net/Transport.js";

/** Maximum Matter message size over TCP, excluding the 4-byte framing field. */
export const DEFAULT_MAX_TCP_MESSAGE_SIZE = 64_000;

/** Options for creating a TCP server. */
export interface TcpServerOptions {
    /**
     * Port to listen on. Optional at the abstraction level (0 or undefined lets the OS choose),
     * but in practice Matter TCP always uses the same port as UDP — the higher-level runtime
     * always provides this.
     */
    listeningPort?: number;

    /** Address to bind to. undefined = all interfaces. */
    listeningAddress?: string;
}

/**
 * Platform-agnostic TCP client socket abstraction.
 * Wraps a connected TCP socket with matter.js-compatible event handling.
 */
export interface TcpSocket {
    readonly remoteAddress: string;
    readonly remotePort: number;
    readonly localPort: number;

    /** Send data over the TCP connection. */
    send(data: Bytes): Promise<void>;

    /** Register a listener for incoming data chunks. */
    onData(listener: (data: Bytes) => void): Transport.Listener;

    /** Register a listener for connection close. */
    onClose(listener: () => void): Transport.Listener;

    /** Register a listener for connection errors. */
    onError(listener: (error: Error) => void): Transport.Listener;

    /** Close the socket. */
    close(): Promise<void>;
}

/**
 * Platform-agnostic TCP server socket abstraction.
 * Listens for incoming TCP connections.
 */
export interface TcpServerSocket {
    readonly port: number;

    /** Register a listener for new incoming connections. */
    onConnection(listener: (socket: TcpSocket) => void): Transport.Listener;

    /** Stop listening and close the server. */
    close(): Promise<void>;
}
