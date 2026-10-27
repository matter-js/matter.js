/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { NoProviderError } from "#MatterError.js";
import { NetworkError } from "#net/Network.js";
import { Gate } from "#util/Promises.js";
import type { HttpEndpoint } from "./HttpEndpoint.js";

/**
 * Environmental service for creating WebSocket client connections.
 *
 * Wraps the standard WebSocket API into {@link HttpEndpoint.WsConnection} stream pairs.  Defaults to
 * `globalThis.WebSocket` but accepts a custom constructor for environments where it is unavailable (e.g. Node.js
 * without native WebSocket).
 */
export class WebSocketClient {
    #Ctor?: WebSocketClient.Constructor;

    constructor(Ctor?: WebSocketClient.Constructor) {
        this.#Ctor = Ctor;
    }

    /**
     * Open a WebSocket connection and return it as a {@link HttpEndpoint.WsConnection}.
     */
    async connect(url: string): Promise<HttpEndpoint.WsConnection> {
        const Ctor = this.#Ctor ?? (globalThis.WebSocket as unknown as WebSocketClient.Constructor | undefined);
        if (!Ctor) {
            throw new NoProviderError("No WebSocket implementation available");
        }

        const ws = new Ctor(url);
        ws.binaryType = "arraybuffer";

        // Listening starts before "open" settles because implementations such as `ws` can emit the first message before
        // the await continuation runs
        const readable = createReadable(ws);

        await new Promise<void>((resolve, reject) => {
            ws.addEventListener("open", onOpen);
            ws.addEventListener("error", onFailure);
            ws.addEventListener("close", onFailure);

            function off() {
                ws.removeEventListener("open", onOpen);
                ws.removeEventListener("error", onFailure);
                ws.removeEventListener("close", onFailure);
            }

            function onOpen() {
                off();
                resolve();
            }

            function onFailure() {
                off();
                reject(new NetworkError(`WebSocket connection to ${url} failed`));
            }
        });

        return { readable, writable: createWritable(ws) };
    }

    static [Environmental.create](env: Environment) {
        const instance = new WebSocketClient();
        env.set(WebSocketClient, instance);
        return instance;
    }

    /**
     * Wrap an open standard WebSocket into a {@link HttpEndpoint.WsConnection}.
     */
    static streams(ws: WebSocketClient.StandardWebSocket): HttpEndpoint.WsConnection {
        return {
            readable: createReadable(ws),
            writable: createWritable(ws),
        };
    }
}

export namespace WebSocketClient {
    /**
     * A standard WebSocket constructor.
     */
    export interface Constructor {
        new (url: string): StandardWebSocket;
    }

    /**
     * The subset of the standard WebSocket API we require.
     */
    export interface StandardWebSocket {
        binaryType: string;
        readonly readyState: number;
        send(data: string | ArrayBufferLike | ArrayBufferView): void;
        close(code?: number, reason?: string): void;
        addEventListener(type: string, listener: (event: any) => void): void;
        removeEventListener(type: string, listener: (event: any) => void): void;
    }
}

function createReadable(ws: WebSocketClient.StandardWebSocket) {
    const queue = Array<HttpEndpoint.WsMessage | Error>();
    const ready = new Gate();
    let isClosed = false;

    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
    ws.addEventListener("close", onClose);

    return new ReadableStream<HttpEndpoint.WsMessage>({
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

            if (next instanceof Error) {
                controller.error(next);
                return;
            }

            controller.enqueue(next);
        },

        cancel() {
            if (!isClosed) {
                ws.close();
                isClosed = true;
                queue.length = 0;
            }
        },
    });

    function onMessage(event: { data: unknown }) {
        let { data } = event;

        if (data instanceof ArrayBuffer) {
            data = new Uint8Array(data);
        }

        queue.push(data as HttpEndpoint.WsMessage);
        ready.open();
    }

    function onError() {
        isClosed = true;
        queue.push(new NetworkError("WebSocket error"));
        ready.open();
    }

    function onClose() {
        isClosed = true;
        ready.open();
    }
}

function createWritable(ws: WebSocketClient.StandardWebSocket) {
    return new WritableStream<HttpEndpoint.WsMessage>({
        write(chunk) {
            ws.send(chunk as string | ArrayBufferLike);
        },

        close() {
            // readyState 2 = CLOSING, 3 = CLOSED
            if (ws.readyState < 2) {
                ws.close(1000);
            }
        },

        abort() {
            if (ws.readyState < 2) {
                ws.close();
            }
        },
    });
}
