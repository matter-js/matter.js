/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteServer } from "../remote/RemoteServer.js";
import { HttpInterface } from "./HttpInterface.js";

/**
 * Allows control of a Matter node using an HTTP API.
 */
export class HttpServer extends RemoteServer {
    static override readonly id = "http";
    static override readonly interfaceType = HttpInterface;
}

export namespace HttpServer {
    export class State extends RemoteServer.State {
        /**
         * The HTTP server address.
         *
         * Supported protocols:
         *
         *   - http
         *   - https
         *   - http+unix (HTTP over UNIX socket)
         *   - https+unix (HTTPS over UNIX socket)
         */
        override address = "http+unix:matter.sock";
    }
}
