/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, EndpointType } from "#endpoint/index.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Endpoints } from "./Endpoints.js";

/**
 * Access to all endpoints on a client node, including the root endpoint.
 */
export class ClientNodeEndpoints extends Endpoints {
    /**
     * For nodes where the behavior/cluster structure can not be initialized automatically (e.g. by a subscription) or
     * when the subscription data misses special clusters, you can use this method to enable a cluster on a specific
     * endpoint.
     * The method adds the endpoint, if not existing.
     */
    require(endpointId: number, type: Partial<EndpointType> = {}) {
        if (this.has(endpointId)) {
            return this.for(endpointId);
        }
        const endpoint = new Endpoint({
            id: `ep${endpointId}`,
            number: endpointId,
            type: EndpointType({
                name: "ClientEndpoint",
                deviceType: EndpointType.UNKNOWN_DEVICE_TYPE,
                deviceRevision: EndpointType.UNKNOWN_DEVICE_REVISION,
                ...type,
            }),
        });
        (this.node as ClientNode).parts.add(endpoint);
        return endpoint;
    }
}
