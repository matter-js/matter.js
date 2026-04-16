/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HttpEndpoint } from "./HttpEndpoint.js";
import { HttpEndpointFactory } from "./HttpEndpointFactory.js";
import { MockWsConnection } from "./MockWsConnection.js";

/**
 * Mock {@link HttpEndpointFactory} that captures the WebSocket handler installed by WebSocketInterface and provides a
 * {@link MockHttpEndpointFactory.connect} method that creates mock WebSocket pipe pairs.
 */
export class MockHttpEndpointFactory extends HttpEndpointFactory {
    #target?: HttpEndpoint;

    override async create(_options: HttpEndpoint.Configuration): Promise<HttpEndpoint> {
        const endpoint: HttpEndpoint = {
            http: undefined,
            ws: undefined,
            async close() {},
        };
        this.#target = endpoint;
        return endpoint;
    }

    /**
     * Create a new mock WebSocket connection pair.  Invokes the captured WS handler with the server side and returns
     * the client side.
     */
    async connect(): Promise<HttpEndpoint.WsConnection> {
        const target = this.#target;
        if (!target?.ws) {
            throw new Error("No WebSocket handler registered; is WebSocketServer started?");
        }

        const pair = MockWsConnection();

        // Invoke the WS handler in the background — the handler enters a long-running read loop and never returns
        // until the connection closes.
        target.ws(new Request(MockHttpEndpointFactory.WS_URL), () => Promise.resolve(pair.server));

        return pair.client;
    }
}

export namespace MockHttpEndpointFactory {
    /**
     * Default WebSocket URL used by the mock factory.
     */
    export const WS_URL = "ws+unix://matter.sock/";
}
