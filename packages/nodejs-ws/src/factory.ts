/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpEndpoint } from "#general";
import { type NodeJsHttpEndpoint, WsAdapter } from "#nodejs";
import { WebSocketServer } from "ws";
import { WebSocketStreams } from "./WebSocketStreams.js";

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
            return new Promise<void>((resolve, reject) => {
                server.close(err => (err ? reject(err) : resolve()));
            });
        },
    };
};
