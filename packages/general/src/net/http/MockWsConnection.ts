/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Time } from "#time/Time.js";
import { Bytes } from "#util/Bytes.js";
import { Gate } from "#util/Promises.js";
import type { HttpEndpoint } from "./HttpEndpoint.js";

/**
 * Create a linked pair of mock {@link HttpEndpoint.WsConnection}s for testing.
 *
 * Writing to one side's writable makes the data appear in the other side's readable.  No actual WebSocket is involved.
 */
export function MockWsConnection(): MockWsConnection.Pair {
    const clientToServer = createPipe();
    const serverToClient = createPipe();

    return {
        client: {
            readable: serverToClient.readable,
            writable: clientToServer.writable,
        },

        server: {
            readable: clientToServer.readable,
            writable: serverToClient.writable,
        },
    };
}

export namespace MockWsConnection {
    export interface Pair {
        client: HttpEndpoint.WsConnection;
        server: HttpEndpoint.WsConnection;
    }

    /**
     * Send a JSON message on a {@link HttpEndpoint.WsConnection} writable.
     */
    export async function send(connection: HttpEndpoint.WsConnection, message: object) {
        const writer = connection.writable.getWriter();
        try {
            await writer.write(JSON.stringify(message));
        } finally {
            writer.releaseLock();
        }
    }

    /**
     * Read and parse a JSON message from a {@link HttpEndpoint.WsConnection} readable.
     */
    export async function receive(connection: HttpEndpoint.WsConnection) {
        const reader = connection.readable.getReader();
        try {
            const result = await reader.read();
            if (result.done) {
                throw new Error("Expected message but stream ended");
            }
            return JSON.parse(Bytes.toString(result.value));
        } finally {
            reader.releaseLock();
        }
    }
}

interface Pipe {
    readable: ReadableStream<HttpEndpoint.WsMessage>;
    writable: WritableStream<HttpEndpoint.WsMessage>;
}

/**
 * Create a unidirectional pipe backed by a queue and a {@link Gate} for backpressure.
 *
 * Data written to the writable is available on the readable after a macrotask boundary.  This ensures that microtasks
 * on the writing side complete in order before the reading side processes the data, mirroring the async behavior of a
 * real network transport.
 */
function createPipe(): Pipe {
    const queue = Array<HttpEndpoint.WsMessage>();
    const ready = new Gate();
    let isClosed = false;
    let deliveryScheduled = false;

    function scheduleDelivery() {
        if (!deliveryScheduled) {
            deliveryScheduled = true;
            void Time.macrotask.then(() => {
                deliveryScheduled = false;
                ready.open();
            });
        }
    }

    const readable = new ReadableStream<HttpEndpoint.WsMessage>({
        async pull(controller) {
            if (!isClosed && !queue.length) {
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

            controller.enqueue(next);
        },

        cancel() {
            isClosed = true;
            queue.length = 0;
            ready.open();
        },
    });

    const writable = new WritableStream<HttpEndpoint.WsMessage>({
        write(chunk) {
            if (isClosed) {
                return;
            }
            queue.push(chunk);
            scheduleDelivery();
        },

        close() {
            isClosed = true;
            scheduleDelivery();
        },

        abort() {
            isClosed = true;
            queue.length = 0;
            ready.open();
        },
    });

    return { readable, writable };
}
