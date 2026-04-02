/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BasicMultiplex,
    Bytes,
    ChannelType,
    ConnectedChannel,
    DEFAULT_MAX_TCP_MESSAGE_SIZE,
    IpNetworkChannel,
    Logger,
    NetworkError,
    Observable,
    ServerAddressIp,
    ServerAddressTcp,
    TcpConnection,
    Transport,
} from "@matter/general";

const logger = Logger.get("TcpChannel");

/** Size of the length-prefix header in bytes. */
const FRAMING_HEADER_SIZE = 4;

/** Maximum receive buffer size before closing the connection (DoS protection). */
const MAX_RECEIVE_BUFFER_FACTOR = 2;

/**
 * TCP channel implementing Matter message framing.
 *
 * Each message is prefixed with a 4-byte little-endian uint32 length header indicating the number of message bytes
 * that follow. Incoming data is buffered and reassembled into complete messages before being emitted.
 *
 * The {@link maxPayloadSize} represents the maximum total frame size (header + message). The maximum message content
 * size is therefore `maxPayloadSize - 4`.
 */
export class TcpChannel implements IpNetworkChannel<Bytes>, ConnectedChannel {
    readonly isReliable = true as const;
    readonly supportsLargeMessages = true;
    readonly type = ChannelType.TCP;
    readonly maxPayloadSize: number;
    readonly networkAddressChanged = Observable<[ServerAddressIp]>();

    readonly #socket: TcpConnection;
    readonly #messageListeners = new Set<(data: Bytes) => void>();
    readonly #closeListeners = new Set<() => void>();
    readonly #workers = new BasicMultiplex();

    /** Maximum allowed receive buffer size before connection is closed for protection. */
    readonly #maxReceiveBufferSize: number;

    /** Receive buffer — accumulated chunks not yet consumed. */
    #receiveChunks = new Array<Uint8Array>();
    #receiveLength = 0;

    /** Queue for async iteration — messages waiting to be consumed. */
    #iteratorQueue = new Array<Bytes>();
    /** Resolver for a pending next() call waiting for data. */
    #iteratorWaiter?: (value: IteratorResult<Bytes>) => void;
    /** Whether the iterator has been terminated. */
    #iteratorDone = false;

    readonly #isIncoming: boolean;
    #closed = false;

    constructor(socket: TcpConnection, maxPayloadSize = DEFAULT_MAX_TCP_MESSAGE_SIZE, isIncoming = false) {
        this.#socket = socket;
        this.#isIncoming = isIncoming;
        this.maxPayloadSize = maxPayloadSize;
        this.#maxReceiveBufferSize = maxPayloadSize * MAX_RECEIVE_BUFFER_FACTOR;

        socket.onClose(() => this.#handleClose());
        socket.onError(error => this.#handleError(error));

        // Consume raw byte chunks from the socket via async iteration (backpressure-aware)
        this.#workers.add(this.#consumeSocket());
    }

    async #consumeSocket(): Promise<void> {
        try {
            for await (const chunk of this.#socket) {
                if (this.#closed) break;
                this.#handleData(chunk);
            }
        } catch (error) {
            if (!this.#closed) {
                this.#handleError(error instanceof Error ? error : new Error(String(error)));
            }
        }
        if (!this.#closed) {
            this.#handleClose();
        }
    }

    get name() {
        const ip = this.#socket.remoteAddress;
        const host = ip.includes(":") ? `[${ip}]` : ip;
        // For incoming connections the remote port is the client's ephemeral port, not meaningful
        return this.#isIncoming ? `tcp://${host}` : `tcp://${host}:${this.#socket.remotePort}`;
    }

    get networkAddress(): ServerAddressTcp {
        return { type: "tcp", ip: this.#socket.remoteAddress, port: this.#socket.remotePort };
    }

    /** Maximum message content size (total frame size minus the 4-byte length header). */
    get maxMessageSize(): number {
        return this.maxPayloadSize - FRAMING_HEADER_SIZE;
    }

    async send(data: Bytes): Promise<void> {
        if (this.#closed) {
            throw new Error("Connection is closed");
        }

        const message = Bytes.of(data);
        if (message.length > this.maxMessageSize) {
            throw new NetworkError(`Message size ${message.length} exceeds TCP limit of ${this.maxMessageSize}`);
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

        // Terminate the async iterator
        if (!this.#iteratorDone) {
            this.#iteratorDone = true;
            this.#iteratorWaiter?.({ value: undefined, done: true });
            this.#iteratorWaiter = undefined;
        }

        for (const listener of this.#closeListeners) {
            listener();
        }

        await this.#socket.close();
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: () => {
                // Return queued message immediately if available
                if (this.#iteratorQueue.length > 0) {
                    return Promise.resolve({ value: this.#iteratorQueue.shift()!, done: false });
                }

                // Stream ended
                if (this.#iteratorDone || this.#closed) {
                    return Promise.resolve({ value: undefined as unknown as Bytes, done: true });
                }

                // Wait for next message
                return new Promise<IteratorResult<Bytes>>(resolve => {
                    this.#iteratorWaiter = resolve;
                });
            },
        };
    }

    // --- Internal ---

    #handleData(data: Bytes): void {
        if (this.#closed) {
            return;
        }

        const chunk = Bytes.of(data) as Uint8Array;
        this.#receiveChunks.push(chunk);
        this.#receiveLength += chunk.length;

        // Receive buffer cap — prevent memory exhaustion from slow/malicious peers
        if (this.#receiveLength > this.#maxReceiveBufferSize) {
            logger.error(
                `Receive buffer exceeded ${this.#maxReceiveBufferSize} bytes without completing a message, closing`,
            );
            this.#workers.add(this.close());
            return;
        }

        this.#extractMessages();
    }

    #handleClose(): void {
        if (this.#closed) return;
        this.#closed = true;

        // Terminate the async iterator
        if (!this.#iteratorDone) {
            this.#iteratorDone = true;
            this.#iteratorWaiter?.({ value: undefined as unknown as Bytes, done: true });
            this.#iteratorWaiter = undefined;
        }

        for (const listener of this.#closeListeners) {
            listener();
        }
    }

    #handleError(error: Error): void {
        logger.error("TCP connection error:", error.message);
        this.#workers.add(this.close());
    }

    #extractMessages(): void {
        while (true) {
            if (this.#receiveLength < FRAMING_HEADER_SIZE) {
                return;
            }

            const flat = this.#flatten();
            const messageLength = Bytes.dataViewOf(flat).getUint32(0, true);

            // Zero-length frames have no payload but are valid — consume the header and continue
            if (messageLength === 0) {
                this.#consume(flat, FRAMING_HEADER_SIZE);
                continue;
            }

            if (messageLength > this.maxMessageSize) {
                logger.error(`Received TCP message of ${messageLength} bytes exceeds limit of ${this.maxMessageSize}`);
                // TODO: Send MESSAGE_TOO_LARGE status report before closing (spec §4.15.2.3)
                this.#workers.add(this.close());
                return;
            }

            const totalNeeded = FRAMING_HEADER_SIZE + messageLength;
            if (this.#receiveLength < totalNeeded) {
                return;
            }

            const message = flat.subarray(FRAMING_HEADER_SIZE, totalNeeded);
            this.#consume(flat, totalNeeded);

            // Deliver to callback listeners
            for (const listener of this.#messageListeners) {
                listener(message);
            }

            // Deliver to async iterator
            if (this.#iteratorWaiter) {
                const resolve = this.#iteratorWaiter;
                this.#iteratorWaiter = undefined;
                resolve({ value: message, done: false });
            } else if (!this.#iteratorDone) {
                this.#iteratorQueue.push(message);
            }
        }
    }

    /** Advance the receive buffer past the first `count` bytes. */
    #consume(flat: Uint8Array, count: number): void {
        if (this.#receiveLength > count) {
            this.#receiveChunks = [flat.subarray(count)];
            this.#receiveLength -= count;
        } else {
            this.#receiveChunks = [];
            this.#receiveLength = 0;
        }
    }

    /** Collapse all buffered chunks into a single contiguous Uint8Array. */
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
