/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, isObject } from "@matter/general";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { MatterServerInfo } from "../../src/matter-server/matter-server-client.js";
import { parseBigIntAwareJson, toBigIntAwareJson } from "../../src/matter-server/matter-server-client.js";
import { WEBSOCKET_PATH } from "../../src/matter-server/matter-server-process.js";

export const FAKE_SERVER_INFO: MatterServerInfo = {
    fabric_id: 1,
    compressed_fabric_id: 2,
    schema_version: 14,
    min_supported_schema_version: 11,
    sdk_version: "fake-matter-server",
    wifi_credentials_set: false,
    thread_credentials_set: false,
    bluetooth_enabled: false,
};

/** What the fake answers for one request. */
export type FakeServerReply =
    | { result: unknown }
    | { errorCode: number; details: string; failure?: { status?: number; cluster_status?: number; reason?: string } }
    | undefined;

export interface FakeServerRequest {
    messageId: string;
    command: string;
    args: unknown;
}

/**
 * Stand-in for matterjs-server's WebSocket API: sends `server_info` on connect and answers each request
 * through {@link reply}. A request {@link reply} leaves unanswered stays pending until {@link respond}.
 */
export class FakeMatterServer {
    /** Every request received, in arrival order. */
    readonly requests = new Array<FakeServerRequest>();

    /** Errors thrown while serving a frame. */
    readonly failures = new Array<unknown>();

    reply: (request: FakeServerRequest) => FakeServerReply = () => undefined;

    /** Every OTA image POSTed to `/ota-upload/<id>`, in arrival order. */
    readonly uploads = new Array<{ uploadId: string; bytes: number }>();

    /** The HTTP status the fake answers an upload with. */
    uploadStatus = 200;

    #http: Server;
    #server: WebSocketServer;
    #sockets = new Set<WebSocket>();

    private constructor(
        http: Server,
        server: WebSocketServer,
        readonly serverInfo: object,
    ) {
        this.#http = http;
        this.#server = server;
        http.on("request", (request, response) => this.#upload(request, response));

        server.on("connection", socket => {
            this.#sockets.add(socket);
            socket.once("close", () => this.#sockets.delete(socket));
            socket.on("message", data => {
                try {
                    this.#receive(socket, data.toString());
                } catch (e) {
                    this.failures.push(e);
                }
            });
            socket.send(toBigIntAwareJson(this.serverInfo));
        });
    }

    static async start(serverInfo: object = FAKE_SERVER_INFO): Promise<FakeMatterServer> {
        const http = createServer();
        const server = new WebSocketServer({ server: http, path: WEBSOCKET_PATH });
        await new Promise<void>((resolve, reject) => {
            http.once("listening", resolve);
            http.once("error", reject);
            http.listen(0, "127.0.0.1");
        });
        return new FakeMatterServer(http, server, serverInfo);
    }

    get port(): number {
        const address = this.#http.address();
        if (address === null || typeof address === "string") {
            throw new InternalError("Fake matterjs-server is not listening on a port");
        }
        return address.port;
    }

    /** Client connections currently open. */
    get connections(): number {
        return this.#sockets.size;
    }

    get url(): string {
        return `ws://127.0.0.1:${this.port}${WEBSOCKET_PATH}`;
    }

    get httpUrl(): string {
        return `http://127.0.0.1:${this.port}`;
    }

    /** Answer a request left pending by {@link reply}. */
    respond(messageId: string, reply: Exclude<FakeServerReply, undefined>) {
        this.#broadcast(this.#frameFor(messageId, reply));
    }

    pushEvent(event: string, data: unknown) {
        this.#broadcast(toBigIntAwareJson({ event, data }));
    }

    /** Send a frame verbatim, for shapes the protocol never produces. */
    sendRaw(frame: string) {
        this.#broadcast(frame);
    }

    /** Drop every client connection as a crashing server would. */
    dropClients() {
        for (const socket of this.#sockets) {
            socket.terminate();
        }
    }

    async close() {
        this.dropClients();
        await new Promise<void>((resolve, reject) => this.#server.close(e => (e ? reject(e) : resolve())));
        this.#http.closeAllConnections();
        await new Promise<void>((resolve, reject) => this.#http.close(e => (e ? reject(e) : resolve())));
    }

    #upload(request: IncomingMessage, response: ServerResponse) {
        const uploadId = /^\/ota-upload\/(\w+)$/.exec(request.url ?? "")?.[1];
        if (request.method !== "POST" || uploadId === undefined) {
            response.writeHead(404).end();
            return;
        }
        let bytes = 0;
        request.on("data", (chunk: Buffer) => (bytes += chunk.byteLength));
        request.on("end", () => {
            this.uploads.push({ uploadId, bytes });
            response.writeHead(this.uploadStatus, { "Content-Type": "application/json" }).end("{}");
        });
    }

    #receive(socket: WebSocket, text: string) {
        const parsed = parseBigIntAwareJson(text);
        if (!isObject(parsed)) {
            throw new InternalError(`Request is not an object: ${text}`);
        }
        const { message_id: messageId, command, args } = parsed;
        if (typeof messageId !== "string" || typeof command !== "string") {
            throw new InternalError(`Request lacks message_id or command: ${text}`);
        }

        const request = { messageId, command, args };
        this.requests.push(request);

        const reply = this.reply(request);
        if (reply !== undefined) {
            socket.send(this.#frameFor(messageId, reply));
        }
    }

    #frameFor(messageId: string, reply: Exclude<FakeServerReply, undefined>) {
        return "result" in reply
            ? toBigIntAwareJson({ message_id: messageId, result: reply.result })
            : toBigIntAwareJson({
                  message_id: messageId,
                  error_code: reply.errorCode,
                  details: reply.details,
                  ...reply.failure,
              });
    }

    #broadcast(frame: string) {
        if (this.#sockets.size === 0) {
            throw new InternalError(`No connected socket to send ${frame} on`);
        }
        for (const socket of this.#sockets) {
            socket.send(frame);
        }
    }
}
