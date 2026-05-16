/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpEndpoint, Logger, PromiseTimeoutError, Seconds, withTimeout } from "@matter/general";
import { type NodeJsHttpEndpoint, WsAdapter } from "@matter/nodejs";
import { WebSocketServer } from "ws";
import { WebSocketStreams } from "./WebSocketStreams.js";

const logger = Logger.get("WebSocketServer");

/** Bounded wait for the WebSocket server to drain before we terminate remaining clients. */
const WS_SERVER_CLOSE_TIMEOUT = Seconds(2);

/**
 * This is an extension to {@link NodeJsHttpEndpoint} that adds WebSocket support to the node.js HTTP server
 * implementation.
 *
 * This is not a standalone component.
 */
export const factory: WsAdapter.Factory = () => {
    const server = new WebSocketServer({ noServer: true });

    return {
        async handle(req, socket, head) {
            return new Promise<HttpEndpoint.WsConnection>(resolve => {
                server.handleUpgrade(req, socket, head, client => {
                    // Semantically seems like this would work, but somewhere in the ws -> node -> web streams mess it
                    // doesn't.  And adds dozens of stack frames to boot

                    //const duplex = createWebSocketStream(client);
                    //resolve(Duplex.toWeb(duplex) as HttpEndpoint.WsConnection);

                    resolve(WebSocketStreams(client));
                });
            });
        },

        async close() {
            // Resolve with the optional error rather than reject so the same promise can outlive a timeout
            // fallback without producing an unhandled rejection or duplicate error log paths.
            const closing = new Promise<Error | undefined>(resolve => {
                server.close(err => resolve(err ?? undefined));
            });

            try {
                const error = await withTimeout(WS_SERVER_CLOSE_TIMEOUT, closing);
                if (error) {
                    logger.warn("WebSocket server close error:", error);
                }
            } catch (error) {
                if (error instanceof PromiseTimeoutError) {
                    logger.info("WebSocket server close did not complete within timeout, terminating clients");
                    for (const client of server.clients) {
                        client.terminate();
                    }
                    void closing.then(closeError => {
                        if (closeError) {
                            logger.warn("WebSocket server close error after timeout:", closeError);
                        }
                    });
                } else {
                    throw error;
                }
            }
        },
    };
};
