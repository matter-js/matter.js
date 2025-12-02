/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, AppAddress, asJson, Bytes, HttpEndpoint, HttpService, Mutex, Stream } from "#general";
import { StatusResponse, StatusResponseError } from "#types";
import { Api } from "../remote/api/Api.js";
import { ApiPath } from "../remote/api/ApiPath.js";
import { LocalResponse } from "../remote/api/LocalResponse.js";
import { RemoteRequest } from "../remote/api/RemoteRequest.js";
import { RemoteResponse } from "../remote/api/RemoteResponse.js";
import { RemoteInterface } from "../remote/RemoteInterface.js";

const LOG_FACILITY = "WebSocket";

/**
 * WebSocket remote interface.
 */
export class WebSocketInterface extends RemoteInterface {
    static override protocol = "ws";

    #http?: HttpEndpoint;
    #mutex = new Mutex(this);

    protected override async start() {
        this.#http = await this.env.get(HttpService).create(this.address);
        this.#http.ws = this.#handleConnection.bind(this);
    }

    protected override async stop() {
        await super.stop();
        await this.#http?.close();
    }

    /**
     * Handle HTTP connections.
     *
     * Checks path, upgrades to a WebSocket if the path applies, then processes input messages
     */
    async #handleConnection(request: Request, upgrade: () => Promise<HttpEndpoint.WsConnection>) {
        // Normalize path and compare to root
        const address = new AppAddress(request.url);
        const path = new ApiPath(address).toString();
        if (path !== this.root.toString()) {
            return;
        }

        // Upgrade to WebSocket
        const ws = await Abort.race(this.abort, await upgrade());
        if (!ws) {
            return;
        }

        using subtask = Abort.subtask(this.abort);

        const send = async (local: LocalResponse) => {
            await this.#mutex.produce(async () => {
                const message = RemoteResponse(local);
                Api.logResponse(LOG_FACILITY, message);
                const writer = ws.writable.getWriter();
                try {
                    await writer.write(asJson(message));
                } finally {
                    writer.releaseLock();
                }
            });
        };

        for await (let message of Stream.iterable(ws.readable)) {
            let requestId: string | undefined;
            try {
                message = Bytes.toString(message);

                let parsed;
                try {
                    parsed = JSON.parse(message);
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        throw new StatusResponse.InvalidCommandError(`Request parse error: ${e.message}`);
                    }
                    throw e;
                }
                requestId = (parsed as RemoteRequest)?.id;

                const request = RemoteRequest(parsed);

                await this.#handleRequest(request, subtask, send);
            } catch (error) {
                StatusResponseError.accept(error);

                await send({
                    kind: "error",
                    id: requestId,
                    error,
                });
            }
        }

        // Abort any ongoing subscriptions associated with the connection
        subtask.abort();
    }

    async #handleRequest(
        request: RemoteRequest,
        abort: AbortController,
        send: (message: LocalResponse) => Promise<void>,
    ) {
        const response = await this.#mutex.produce(() => Api.execute(LOG_FACILITY, this.node, request, abort));

        if (response.kind !== "subscription") {
            await send(response);
            return;
        }

        await send({ id: request.id, kind: "ok" });

        this.addWorker(this.#handleSubscription(response.stream, send));
    }

    async #handleSubscription(stream: LocalResponse.Stream, send: (message: LocalResponse) => Promise<void>) {
        using _streaming = this.join("streaming");
        for await (const update of stream) {
            await send(update.js);
        }
    }
}
