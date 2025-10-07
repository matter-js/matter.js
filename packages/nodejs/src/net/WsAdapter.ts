/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpEndpoint } from "#general";

import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";

/**
 * This is a pluggable component that handles the upgrade to a WsConnection.
 *
 * We do not implement directly here because Node.js does not support WebSocket servers natively, so we must use a
 * third-party dependency.
 */
export interface WsAdapter {
    handle(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<HttpEndpoint.WsConnection>;
    close(): Promise<void>;
}

export namespace WsAdapter {
    // eslint-disable-next-line prefer-const
    export let defaultFactory = undefined as undefined | Factory;

    export interface Factory {
        (): WsAdapter;
    }
}
