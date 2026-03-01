/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteRequest } from "#behavior/system/remote/api/RemoteRequest.js";
import type { RemoteResponse } from "#behavior/system/remote/api/RemoteResponse.js";
import type { Environment, HttpEndpoint } from "@matter/general";
import { Abort, asJson, Bytes, Logger, Stream, WebSocketClient } from "@matter/general";

const logger = Logger.get("WebSocketConnection");

/**
 * Client-side WebSocket connection to a remote matter.js node.
 *
 * Manages request/response correlation and subscription streaming.
 */
export class WebSocketConnection {
    #ws?: HttpEndpoint.WsConnection;
    #url: string;
    #env: Environment;
    #abort = new Abort();
    #nextId = 1;
    #pending = new Map<string, PendingRequest>();
    #subscriptionListeners = new Map<string, (response: RemoteResponse) => void>();
    #readLoop?: Promise<void>;

    constructor(url: string, env: Environment) {
        this.#url = url;
        this.#env = env;
    }

    get url() {
        return this.#url;
    }

    /**
     * Open the WebSocket connection and start the read loop.
     */
    async open() {
        this.#ws = await this.#env.get(WebSocketClient).connect(this.#url);
        this.#readLoop = this.#runReadLoop();
    }

    /**
     * Close the connection.
     */
    async close() {
        this.#abort();

        // Reject all pending requests
        for (const pending of this.#pending.values()) {
            pending.reject(new Error("Connection closed"));
        }
        this.#pending.clear();
        this.#subscriptionListeners.clear();

        await this.#readLoop;
        this.#ws = undefined;
    }

    /**
     * Send a request and wait for a single response.
     */
    async request(request: Omit<RemoteRequest, "id">): Promise<RemoteResponse> {
        const id = String(this.#nextId++);
        const message = { ...request, id };

        return new Promise<RemoteResponse>((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
            this.#send(message).catch(reject);
        });
    }

    /**
     * Send a subscribe request.  Returns the subscription ID and installs a listener for streaming responses.
     *
     * The caller receives the "ok" confirmation, then subsequent update/delete responses arrive via the listener.
     */
    async subscribe(
        request: Omit<RemoteRequest, "id">,
        listener: (response: RemoteResponse) => void,
    ): Promise<RemoteResponse> {
        const id = String(this.#nextId++);
        const message = { ...request, id };

        return new Promise<RemoteResponse>((resolve, reject) => {
            this.#pending.set(id, {
                resolve: (response: RemoteResponse) => {
                    // Once we get the "ok", install the subscription listener
                    if (response.kind === "ok") {
                        this.#subscriptionListeners.set(id, listener);
                    }
                    resolve(response);
                },
                reject,
            });
            this.#send(message).catch(reject);
        });
    }

    /**
     * Remove a subscription listener.
     */
    unsubscribe(id: string) {
        this.#subscriptionListeners.delete(id);
    }

    async #send(message: object) {
        if (!this.#ws) {
            throw new Error("WebSocket not connected");
        }

        const writer = this.#ws.writable.getWriter();
        try {
            await writer.write(asJson(message));
        } finally {
            writer.releaseLock();
        }
    }

    async #runReadLoop() {
        if (!this.#ws) {
            return;
        }

        try {
            for await (let message of Stream.iterable(this.#ws.readable)) {
                if (Abort.is(this.#abort)) {
                    break;
                }

                try {
                    const text = typeof message === "string" ? message : Bytes.toString(message);
                    const response = JSON.parse(text) as RemoteResponse & { id?: string };

                    this.#dispatch(response);
                } catch (e) {
                    logger.error("Error processing WebSocket message:", e);
                }
            }
        } catch (e) {
            if (!Abort.is(this.#abort)) {
                logger.error("WebSocket read loop error:", e);
            }
        }
    }

    #dispatch(response: RemoteResponse & { id?: string }) {
        const id = response.id;

        if (id !== undefined) {
            // Check for a subscription listener (streaming responses after initial "ok")
            const subscriptionListener = this.#subscriptionListeners.get(id);
            if (subscriptionListener) {
                subscriptionListener(response);
                return;
            }

            // Check for a pending one-shot request
            const pending = this.#pending.get(id);
            if (pending) {
                this.#pending.delete(id);
                if (response.kind === "error") {
                    pending.reject(new Error(response.message));
                } else {
                    pending.resolve(response);
                }
                return;
            }
        }

        logger.debug("Received unmatched response:", response.kind, id ?? "(no id)");
    }
}

interface PendingRequest {
    resolve: (response: RemoteResponse) => void;
    reject: (error: Error) => void;
}
