/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { ChannelType, IpNetworkChannel } from "#net/Channel.js";
import { NetworkError } from "#net/Network.js";
import { ServerAddressTcp } from "#net/ServerAddress.js";
import { Transport } from "#net/Transport.js";
import { Bytes } from "#util/Bytes.js";
import { BasicMultiplex } from "#util/Multiplex.js";
import { Observable } from "#util/index.js";
import { DEFAULT_MAX_TCP_MESSAGE_SIZE, TcpSocket } from "./TcpSocket.js";

const logger = Logger.get("TcpConnection");

/** Size of the length-prefix header in bytes. */
const FRAMING_HEADER_SIZE = 4;

/**
 * TCP channel implementing Matter message framing.
 *
 * Each message is prefixed with a 4-byte little-endian uint32 length header indicating the number of message bytes
 * that follow. Incoming data is buffered and reassembled into complete messages before being emitted.
 *
 * The {@link maxPayloadSize} represents the maximum total frame size (header + message). The maximum message content
 * size is therefore `maxPayloadSize - 4`.
 */
export class TcpConnection implements IpNetworkChannel<Bytes> {
    readonly isReliable = true;
    readonly supportsLargeMessages = true;
    readonly type = ChannelType.TCP;
    readonly maxPayloadSize: number;
    readonly networkAddressChanged = Observable<[ServerAddressTcp]>();

    readonly #socket: TcpSocket;
    readonly #messageListeners = new Set<(data: Bytes) => void>();
    readonly #closeListeners = new Set<() => void>();
    readonly #workers = new BasicMultiplex();

    /** Receive buffer — accumulated chunks not yet consumed. */
    #receiveChunks: Uint8Array[] = [];
    #receiveLength = 0;

    #closed = false;

    constructor(socket: TcpSocket, maxPayloadSize = DEFAULT_MAX_TCP_MESSAGE_SIZE) {
        this.#socket = socket;
        this.maxPayloadSize = maxPayloadSize;

        socket.onData(data => this.#handleData(data));
        socket.onClose(() => this.#handleClose());
        socket.onError(error => this.#handleError(error));
    }

    get name() {
        const ip = this.#socket.remoteAddress;
        const host = ip.includes(":") ? `[${ip}]` : ip;
        return `tcp://${host}:${this.#socket.remotePort}`;
    }

    get networkAddress(): ServerAddressTcp {
        return { type: "tcp", ip: this.#socket.remoteAddress, port: this.#socket.remotePort };
    }

    /** Maximum message content size (total frame size minus the 4-byte length header). */
    get maxMessageSize(): number {
        return this.maxPayloadSize - FRAMING_HEADER_SIZE;
    }

    /**
     * Send a framed message — prepends a 4-byte little-endian length header.
     */
    async send(data: Bytes): Promise<void> {
        if (this.#closed) {
            throw new Error("Connection is closed");
        }

        const message = Bytes.of(data);
        if (message.length >= this.maxMessageSize) {
            throw new NetworkError(
                `Message size ${message.length} exceeds TCP limit of ${this.maxMessageSize}`,
            );
        }
        const frame = new Uint8Array(FRAMING_HEADER_SIZE + message.length);
        const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
        view.setUint32(0, message.length, true);
        frame.set(message, FRAMING_HEADER_SIZE);
        await this.#socket.send(frame);
    }

    /**
     * Register a listener for complete, deframed messages.
     */
    onMessage(listener: (data: Bytes) => void): Transport.Listener {
        this.#messageListeners.add(listener);
        return {
            close: async () => {
                this.#messageListeners.delete(listener);
            },
        };
    }

    /**
     * Register a listener for connection close.
     */
    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
    }

    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        await this.#socket.close();
    }

    // --- Internal ---

    #handleData(data: Bytes): void {
        // Bytes.of() always returns Uint8Array at runtime
        const chunk = Bytes.of(data) as Uint8Array;
        this.#receiveChunks.push(chunk);
        this.#receiveLength += chunk.length;

        this.#extractMessages();
    }

    #handleClose(): void {
        this.#closed = true;
        for (const listener of this.#closeListeners) {
            listener();
        }
    }

    #handleError(error: Error): void {
        logger.error("TCP connection error:", error.message);
        this.#workers.add(this.close());
    }

    /**
     * Attempt to extract one or more complete framed messages from the receive buffer.
     */
    #extractMessages(): void {
        while (true) {
            if (this.#receiveLength < FRAMING_HEADER_SIZE) {
                return;
            }

            const flat = this.#flatten();
            const view = new DataView(flat.buffer, flat.byteOffset, flat.byteLength);
            const messageLength = view.getUint32(0, true);

            // Oversized message: the total frame (header + message) must fit within maxPayloadSize
            if (messageLength >= this.maxMessageSize) {
                logger.error(
                    `Received TCP message of ${messageLength} bytes exceeds limit of ${this.maxMessageSize}`,
                );
                // TODO: Send MESSAGE_TOO_LARGE status report (general code 17) before closing,
                // per spec §4.15.2.3. This requires protocol-layer StatusReport construction
                // which is above the transport layer. Needs callback or event to protocol layer.
                this.#workers.add(this.close());
                return;
            }

            const totalNeeded = FRAMING_HEADER_SIZE + messageLength;
            if (this.#receiveLength < totalNeeded) {
                return;
            }

            const message = flat.slice(FRAMING_HEADER_SIZE, totalNeeded);

            if (this.#receiveLength > totalNeeded) {
                const remainder = flat.slice(totalNeeded);
                this.#receiveChunks = [remainder];
                this.#receiveLength = remainder.length;
            } else {
                this.#receiveChunks = [];
                this.#receiveLength = 0;
            }

            for (const listener of this.#messageListeners) {
                listener(message);
            }
        }
    }

    /**
     * Collapse all buffered chunks into a single contiguous Uint8Array.
     */
    #flatten(): Uint8Array {
        if (this.#receiveChunks.length === 1) {
            return this.#receiveChunks[0];
        }

        const result = new Uint8Array(this.#receiveLength);
        let offset = 0;
        for (const chunk of this.#receiveChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        this.#receiveChunks = [result];
        return result;
    }
}
