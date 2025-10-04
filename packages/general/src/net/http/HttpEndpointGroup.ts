/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { MatterAggregateError } from "#MatterError.js";
import { HttpEndpoint } from "./HttpEndpoint.js";

const logger = Logger.get("HttpEndpointGroup");

/**
 * A collection of HTTP endpoints that support the same set of handlers.
 */
export class HttpEndpointGroup implements HttpEndpoint {
    #endpoints: HttpEndpoint[];

    constructor(endpoints: HttpEndpoint[]) {
        this.#endpoints = endpoints;
    }

    set http(handler: HttpEndpoint.HttpHandler) {
        for (const endpoint of this.#endpoints) {
            endpoint.http = handler;
        }
    }

    set ws(handler: HttpEndpoint.WsHandler) {
        for (const endpoint of this.#endpoints) {
            endpoint.ws = handler;
        }
    }

    async close(): Promise<void> {
        try {
            await MatterAggregateError.allSettled(this.#endpoints.map(endpoint => endpoint.close()));
        } catch (e) {
            logger.error("Error closing HTTP endpoints", e);
        }
        this.#endpoints = [];
    }
}
