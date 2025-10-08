/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, Bytes, Gate, InternalError } from "#general";
import { WebSocket } from "ws";

/**
 * Adapt a {@link WebSocket} to a standard readable/writable pair.
 */
export function WebSocketStreams(client: WebSocket): ReadableWritablePair<string | Bytes> {
    if (client.readyState !== WebSocket.OPEN) {
        throw new InternalError(`WebSocket expected to be open but is ${client.readyState}`);
    }

    const readable = createReadable(client);
    const writable = createWritable(client);

    return { readable, writable };
}

/**
 * Create a standard {@link ReadableStream} for WebSocket reads.
 */
export function createReadable(client: WebSocket) {
    const queue = Array<Bytes | string | Error>();
    const ready = new Gate();
    let isClosed = false;

    client.addEventListener("message", onMessage);
    client.addEventListener("error", onError);
    client.addEventListener("close", onClose);

    // This pauses the underlying socket so hopefully applies proper backpressure
    client.pause();

    return new ReadableStream<Bytes | string>({
        async pull(controller) {
            try {
                if (!isClosed) {
                    client.resume();
                    await ready;
                }

                const next = queue.shift();
                if (!queue.length && !isClosed) {
                    ready.close();
                }

                if (next === undefined) {
                    controller.close();
                    return;
                }

                if (next instanceof Error) {
                    controller.error(next);
                    return;
                }

                controller.enqueue(next);
            } finally {
                if (!isClosed) {
                    client.pause();
                }
            }
        },

        async cancel() {
            if (isClosed) {
                return;
            }

            client.close();
            queue.length = 0;
            // The close event will open the read gate
        },
    });

    function onMessage(message: WebSocket.MessageEvent) {
        let { data } = message;

        if (Array.isArray(data)) {
            data = Buffer.concat(data);
        }

        queue.push(data);
        ready.open();
    }

    function onError(e: WebSocket.ErrorEvent) {
        isClosed = true;
        queue.push(asError(e.error));
        ready.open();
    }

    function onClose() {
        isClosed = true;
        ready.open();
    }
}

/**
 * Create a standard {@link WritableStream} for WebSocket writes.
 */
export function createWritable(client: WebSocket) {
    return new WritableStream<string | Bytes>({
        async write(chunk, controller) {
            try {
                await new Promise<void>((resolve, reject) => {
                    client.send(chunk, error => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            } catch (e) {
                controller.error(e);
            }
        },

        async close() {
            if (client.readyState === WebSocket.CLOSED) {
                return;
            }

            const closed = new Promise(resolve => client.once("close", resolve));

            if (client.readyState !== WebSocket.CLOSING) {
                client.close(1000);
            }

            await closed;
        },

        async abort() {
            if (client.readyState === WebSocket.CLOSED) {
                return;
            }

            client.terminate();
        },
    });
}
