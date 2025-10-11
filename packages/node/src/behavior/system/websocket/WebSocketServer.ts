/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteServer } from "../remote/RemoteServer.js";
import { WebSocketInterface } from "./WebSocketInterface.js";

/**
 * Allows control of a Matter node using an HTTP API.
 */
export class WebSocketServer extends RemoteServer {
    static override readonly id = "websocket";
    static override readonly interfaceType = WebSocketInterface;
}

export namespace WebSocketServer {
    export class State extends RemoteServer.State {
        /**
         * The WebSocket address.
         *
         * Supported protocols:
         *
         *   - ws (unencrypted WebSocket)
         *   - wss (encrypted WebSocket)
         *   - ws+unix (WebSockets over a UNIX socket)
         *   - wss+unix (WebSockets over a secure UNIX socket)
         */
        override address = "ws+unix:matter.sock";
    }
}
