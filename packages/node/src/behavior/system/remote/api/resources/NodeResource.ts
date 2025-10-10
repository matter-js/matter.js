/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from "#endpoint/Agent.js";
import { Node } from "#node/Node.js";
import { ApiResource } from "../ApiResource.js";
import { EndpointContainerResource } from "./EndpointContainerResource.js";
import { EndpointResource } from "./EndpointResource.js";

/**
 * Specialization for {@link EndpointResource} that adds "endpoints" collection.
 */
export class NodeResource extends EndpointResource {
    constructor(agent: Agent, parent: undefined | ApiResource) {
        super(agent, parent);
    }

    override get valueKind(): ApiResource.Kind {
        return "node";
    }

    override async childFor(name: string): Promise<ApiResource | void> {
        const {
            node: { endpoints },
        } = this;

        // The "flat" endpoint IDs only apply at the top-level of an endpoint; otherwise they map to cluster IDs.  That
        // should be fine because clusters will usually be referenced by name
        if (!this.isSelfReferential) {
            // Numeric indices on nodes map to endpoints
            if (name.match(/^\d+$/)) {
                return (await this.childFor("endpoints"))?.childFor(name);
            }
        }

        // Endpoint collection
        if (name === "endpoints") {
            return new EndpointContainerResource(
                this,
                "endpoints",
                () => endpoints.map(endpoint => endpoint.number.toString()),
                name => {
                    if (!name.match(/^\d+$/)) {
                        return;
                    }
                    const number = Number.parseInt(name);
                    if (Number.isNaN(number) || !endpoints.has(number)) {
                        return;
                    }

                    const endpoint = endpoints.for(number);
                    return new EndpointResource(endpoint.agentFor(this.agent.context), this);
                },
            );
        }

        // Pass to endpoint resolver
        return super.childFor(name);
    }

    get node() {
        return this.agent.endpoint as Node;
    }

    get isSelfReferential() {
        return this.parent instanceof NodeResource && this.parent.node === this.node;
    }
}
