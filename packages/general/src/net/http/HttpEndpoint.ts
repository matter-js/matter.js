/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppAddress } from "#net/AppAddress.js";
import { Bytes } from "#util/Bytes.js";
import { MaybePromise } from "#util/Promises.js";

/**
 * A platform-independent HTTP endpoint implementation.
 *
 * This provides a modern WinterTC-style interface with a focus on simplifying platform-specific implementations.
 */
export interface HttpEndpoint {
    /**
     * Handler for normal HTTP requests.
     */
    http?: HttpEndpoint.HttpHandler;

    /**
     * Handler for WebSocket upgrade requests.
     */
    ws?: HttpEndpoint.WsHandler;

    /**
     * Release resources for the endpoint.
     */
    close(): Promise<void>;
}

export namespace HttpEndpoint {
    /**
     * HTTP request callback.
     */
    export type HttpHandler = (request: Request) => MaybePromise<void | Response>;

    /**
     * WebSocket request callback.
     */
    export type WsHandler = (request: Request, upgrade: () => Promise<WsConnection>) => MaybePromise<void>;

    /**
     * A WebSocket connection.
     */
    export interface WsConnection extends ReadableWritablePair<WsMessage, WsMessage> {}

    /**
     * Raw WebSocket message payload.
     */
    export type WsMessage = Bytes | string;

    /**
     * Configuration options.
     */
    export interface Options {
        address: AppAddress.Definition;
    }
}
