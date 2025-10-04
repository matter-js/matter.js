/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpEndpoint } from "./HttpEndpoint.js";
import type { HttpService } from "./HttpService.js";

/**
 * Environmental component that creates HTTP endpoints.
 *
 * This component creates a dedicated HTTP server.  Use {@link HttpService} for shared access to HTTP endpoints.
 */
export abstract class HttpEndpointFactory {
    /**
     * Indicates support for HTTP handlers.
     */
    supportsHttp = true;

    /**
     * Indicates support for WebSocket handlers.
     */
    supportsWs = true;

    abstract create(options: HttpEndpoint.Options): Promise<HttpEndpoint>;
}
