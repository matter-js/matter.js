/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppAddress, asError, HttpEndpoint, HttpEndpointFactory, Logger, NetworkError } from "#general";
import { existsSync, ReadStream, rmSync, statSync } from "node:fs";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { ListenOptions } from "node:net";
import { normalize, resolve } from "node:path";
import { Duplex } from "node:stream";

// Node's ReadableStream type definition do not exactly match the standard version so we need to import to support casts
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { WsAdapter } from "./WsAdapter.js";

const logger = new Logger("NodeJsHttpEndpoint");

/**
 * An implementation of {@link HttpEndpoint} that uses Node.js's standard {@link Server}.
 *
 * WebSocket support is optional.  You can install by importing `@matter/nodejs-ws`.
 *
 * This implementation is a little ugly because the native Node.js HTTP server API is pre-async and has some design
 * flaws.  Other runtimes tend build on WinterTC standards and adapters will be much simpler.
 */
export class NodeJsHttpEndpoint implements HttpEndpoint {
    #server: Server;
    #ready: Promise<void>;
    #http?: HttpEndpoint.HttpHandler;
    #httpListener?: (req: IncomingMessage, res: ServerResponse) => void;
    #ws?: HttpEndpoint.WsHandler;
    #wsListener?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
    #notFound: (res: ServerResponse) => void;

    #wsAdapter?: WsAdapter;
    #wsAdapterFactory?: WsAdapter.Factory;

    static async create(options: NodeJsHttpEndpoint.Options): Promise<NodeJsHttpEndpoint> {
        const endpoint = new NodeJsHttpEndpoint(options);
        await endpoint.ready;
        return endpoint;
    }

    /**
     * Create a new endpoint.
     *
     * You may pass an existing {@link Server} or pass {@link NodeJsHttpEndpoint.Options} to create a server dedicated
     * to this endpoint.
     */
    constructor(optionsOrServer: Server | NodeJsHttpEndpoint.Options) {
        let close, ready, server, notFound;

        if ("on" in optionsOrServer) {
            ({ close, ready, server, notFound } = this.#bindToServer(optionsOrServer));
        } else {
            ({ close, ready, server, notFound } = this.#createDedicatedServer(optionsOrServer));
        }

        this.#server = server;
        this.#ready = ready;
        this.close = close;
        this.#notFound = notFound;
    }

    get server() {
        return this.#server;
    }

    #bindToServer(server: Server) {
        return {
            server,
            ready: Promise.resolve(),
            close: async () => {
                this.http = undefined;
                this.ws = undefined;
            },
            notFound: () => undefined,
        };
    }

    #createDedicatedServer(options: NodeJsHttpEndpoint.Options) {
        const server = createServer({ keepAlive: true });

        const opts = {} as ListenOptions;

        const address = AppAddress.for(options.address);
        const { transport } = address;
        switch (transport.kind) {
            case "ip":
                if (!address.isWildcardHost) {
                    opts.host = address.host;
                }
                if (!address.isWildcardPort) {
                    opts.port = address.portNum;
                }
                break;

            case "unix":
                const path = decodeURIComponent(address.hostname);
                if (options.basePathForUnixSockets) {
                    opts.path = resolve(options.basePathForUnixSockets, normalize(path));
                } else {
                    opts.path = normalize(path);
                }
                if (existsSync(opts.path)) {
                    if (statSync(opts.path).isSocket()) {
                        try {
                            rmSync(opts.path);
                        } catch (e) {
                            throw new NetworkError(
                                `Error deleting previous socket at ${opts.path}: ${asError(e).message}`,
                            );
                        }
                    } else {
                        throw new NetworkError(`UNIX socket path ${opts.path} exists and is not a socket`);
                    }
                }
                break;

            default:
                throw new NetworkError(
                    `Unsupported address type "${(options.address as any)?.type}" for HTTP endpoint`,
                );
        }

        server.listen(opts);

        return {
            server,

            ready: new Promise<void>((resolve, reject) => {
                let settled = false;
                server.once("listening", () => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    resolve();
                });
                server.once("error", error => {
                    if (settled) {
                        logger.error("Underlying server reported error after success listen", error);
                        return;
                    }

                    settled = true;
                    reject(error);
                });
            }),

            close: async () => {
                return new Promise<void>((resolve, reject) => {
                    server.close(err => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        resolve();
                    });
                });
            },

            notFound: (res: ServerResponse) => respondError(res, 404),
        };
    }

    get ready() {
        return this.#ready;
    }

    set http(handler: HttpEndpoint.HttpHandler | undefined) {
        this.#http = handler;

        if (!this.#http) {
            if (this.#httpListener) {
                this.#server.off("request", this.#httpListener);
            }
            return;
        }

        if (this.#httpListener) {
            return;
        }

        this.#httpListener = (req, res) => {
            this.#handleHttp(req, res).catch(error => {
                logger.error("Unhandled error in HTTP endpoint handler", error);
                respondError(res, 500);
            });
        };

        this.#server.on("request", this.#httpListener);
    }

    set ws(handler: HttpEndpoint.WsHandler | undefined) {
        this.#ws = handler;

        if (!this.#ws) {
            if (this.#wsListener) {
                this.#server.off("upgrade", this.#wsListener);
            }
            return;
        }

        let adapter = this.#wsAdapter;
        if (!adapter) {
            const factory = this.#wsAdapterFactory ?? WsAdapter.defaultFactory;
            if (!factory) {
                logger.warn(
                    "WebSocket support disabled because no adapter is installed; please import @matter/nodejs-ws or equivalent",
                );
                return;
            }
            adapter = this.#wsAdapter = factory();
        }

        this.#wsListener = (req, socket, head) => {
            this.#handleUpgrade(adapter, req, socket, head).catch(error => {
                logger.error("Unhandled error WebSocket endpoint", error);
            });
        };

        this.#server.on("upgrade", this.#wsListener);
    }

    close: () => Promise<void>;

    async #handleHttp(req: IncomingMessage, res: ServerResponse) {
        if (!this.#http) {
            return;
        }

        const request = new NodeJsHttpRequest(req);

        const response = await this.#http(request);
        if (!response) {
            this.#notFound(res);
            return;
        }

        res.statusCode = response.status;
        res.statusMessage = response.statusText;

        response.headers.forEach(([name, value]) => res.appendHeader(name, value));

        if (response.body === null) {
            res.end();
            return;
        }

        const nodeBodyStream = ReadStream.fromWeb(response.body as NodeReadableStream);

        nodeBodyStream.on("error", error => {
            logger.error("Error transmitting HTTP body", error);
            respondError(res, 500);
        });

        nodeBodyStream.pipe(res);
    }

    async #handleUpgrade(adapter: WsAdapter, req: IncomingMessage, socket: Duplex, head: Buffer) {
        if (req.headers.upgrade !== "websocket") {
            // Not clear how to send a 426 with Node's API
            socket.destroy();
            return;
        }

        // This shouldn't happen
        if (!this.#ws) {
            socket.destroy();
            return;
        }

        const request = new NodeJsHttpRequest(req);

        try {
            await this.#ws(request, async () => {
                return adapter.handle(req, socket, head);
            });
        } finally {
            // Node API is fairly broken and offers no way to indicate we've skipped the socket so we must destroy it
            // if not already handled
            if (!socket.destroyed) {
                socket.destroy();
            }
        }
    }
}

class NodeJsHttpRequest extends Request {
    constructor(message: IncomingMessage) {
        const { method, rawHeaders } = message;

        const url = `http://${message.headers.host ?? "unknown"}${message.url ?? "/"}`;

        const headers = new Headers();

        for (let i = 0; i < message.rawHeaders.length; i += 2) {
            headers.append(rawHeaders[i], rawHeaders[i + 1]);
        }

        const init = {
            method,
            headers,
            duplex: "half", // Not in RequestInit type but required by node
        } as RequestInit;

        if (method !== "GET" && method !== "HEAD") {
            init.body = IncomingMessage.toWeb(message) as ReadableStream;
        }

        super(url, init);
    }
}

function respondError(res: ServerResponse, code: number) {
    if (res.closed) {
        return;
    }

    try {
        if (!res.headersSent) {
            res.statusCode = code;
            res.setHeader("Content-Type", "text/plain");
            res.end(`HTTP error ${code}\n`);
        } else {
            res.end();
        }
    } catch (e) {
        logger.warn(`Error conveying ${code} error:`, asError(e).message);
    }
}

export namespace NodeJsHttpEndpoint {
    export interface Options extends HttpEndpoint.Options {
        basePathForUnixSockets?: string;
    }

    export class Factory extends HttpEndpointFactory {
        #basePathForUnixSockets?: string;

        constructor(basePathForUnixSockets?: string) {
            super();
            this.#basePathForUnixSockets = basePathForUnixSockets;
        }

        async create(options: HttpEndpoint.Options) {
            return NodeJsHttpEndpoint.create({
                basePathForUnixSockets: this.#basePathForUnixSockets,
                ...options,
            });
        }
    }
}
