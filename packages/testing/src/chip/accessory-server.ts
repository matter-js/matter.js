/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { Parser } from "xml2js";
import { BackchannelCommand } from "../device/backchannel.js";

export class AccessoryMethodError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
    }
}

/**
 * Server side the CHIP testing "accessory" protocol invoked by `accessory_server_bridge.py` in the SDK.
 */
export class AccessoryServer {
    #server: Server;
    #isClosed = false;
    #subject: BackchannelCommand.Subject;

    private constructor(subject: BackchannelCommand.Subject, onReady: () => void) {
        this.#subject = subject;
        this.#server = createServer(this.#handleRequest.bind(this));
        this.#server.listen(0, "127.0.0.1", onReady);
    }

    static create(subject: BackchannelCommand.Subject) {
        return new Promise<AccessoryServer>(resolve => {
            const server = new AccessoryServer(subject, () => resolve(server));
        });
    }

    get port() {
        const port = (this.#server.address() as AddressInfo)?.port;
        if (typeof port !== "number") {
            // Shouldn't happen
            throw new Error("Accessory server has no assigned port");
        }
        return port;
    }

    async close() {
        if (!this.#isClosed) {
            this.#isClosed = true;
            await new Promise<void>(resolve =>
                this.#server.close(error => {
                    if (error) {
                        console.warn("Error closing accessory server", error);
                    }
                    resolve();
                }),
            );
        }
    }

    #handleRequest(request: IncomingMessage, response: ServerResponse) {
        request.on("error", error => {
            console.warn("Accessory server request error", error);
        });

        response.on("error", error => {
            console.warn("Accessory server response error", error);
        });

        const parser = new Parser();
        request.on("data", chunk => {
            parser.parseString(chunk, (error, result) => {
                if (error) {
                    response.writeHead(400);
                    response.end();
                    return;
                }
                if (result !== undefined) {
                    this.#invoke(result).then(
                        () => {
                            response.writeHead(200);
                            response.end(
                                `<?xml version="1.0"?>\n<methodResponse><params><param><value><boolean>1</boolean></value></param></params></methodResponse>`,
                            );
                        },
                        error => {
                            const status = error instanceof AccessoryMethodError ? error.status : 500;
                            console.warn(`Accessory invocation error (HTTP ${status}):`, error);
                            response.writeHead(status);
                            response.end();
                        },
                    );
                }
            });
        });
    }

    async #invoke(request: any) {
        const methodName = request?.methodCall?.methodName?.[0];
        if (typeof methodName !== "string") {
            throw new AccessoryMethodError("Missing or invalid accessory method name");
        }

        switch (methodName) {
            case "reboot":
            case "factoryReset":
            case "start":
            case "stop":
                await this.#subject.backchannel({ name: methodName });
                return;

            case "waitForMessage":
            case "createOtaImage":
            case "compareFiles":
            case "createFile":
            case "deleteFile":
                throw new AccessoryMethodError(`Unimplemented accessory method ${methodName}`, 404);
        }

        throw new AccessoryMethodError(`Unsupported accessory method ${methodName}`, 404);
    }
}
