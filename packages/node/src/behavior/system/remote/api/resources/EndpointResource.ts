/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from "#endpoint/Agent.js";
import { camelize } from "#general";
import { ApiResource } from "../ApiResource.js";
import { BehaviorResource } from "./BehaviorResource.js";
import { EndpointContainerResource } from "./EndpointContainerResource.js";

/**
 * API item for endpoints.
 *
 * Direct descendents are either behaviors or collections, represented by {@link BehaviorResource} and
 * {@link EndpointContainerResource} respectively.
 */
export class EndpointResource extends ApiResource {
    readonly agent: Agent;

    constructor(agent: Agent, parent: undefined | ApiResource) {
        super(parent);
        this.agent = agent;
    }

    get valueKind(): ApiResource.Kind {
        return "endpoint";
    }

    get id() {
        return this.agent.endpoint.id;
    }

    get schema() {
        return undefined;
    }

    get dataModelPath() {
        return this.agent.endpoint.path;
    }

    override get value() {
        return this.agent.endpoint.state;
    }

    override async childFor(name: string): Promise<ApiResource | void> {
        if (name === "parts") {
            return new EndpointContainerResource(
                this,
                "parts",
                () => this.agent.endpoint.parts.map(part => part.id),
                name => {
                    const part = this.agent.endpoint.parts.get(name);
                    if (part) {
                        return new EndpointResource(part.agentFor(this.agent.context), this);
                    }
                },
            );
        }

        name = camelize(name);

        const { supported } = this.agent.endpoint.behaviors;
        if (name in supported) {
            const type = supported[name];

            const behavior = this.agent.get(type);

            // A behavior must have schema to be publicly accessible
            if (behavior.type.schema === undefined) {
                return;
            }

            return new BehaviorResource(behavior, this);
        }
    }
}
