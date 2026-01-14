/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Agent } from "#endpoint/Agent.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { EndpointType } from "#endpoint/type/EndpointType.js";
import type { ActionContext } from "../ActionContext.js";

/**
 * Internal helper for managing agents associated with a session.
 */
export interface ContextAgents {
    [Symbol.toStringTag]: "ContextAgents";
    agentFor<const T extends EndpointType>(endpoint: Endpoint<T>): Agent.Instance<T>;
}

const contextAgents = new WeakMap<ActionContext, ContextAgents>();

export function ContextAgents(context: ActionContext) {
    let instance = contextAgents.get(context);

    if (instance === undefined) {
        instance = create(context);
        contextAgents.set(context, instance);
    }

    return instance;
}

function create(context: ActionContext): ContextAgents {
    const agents = new Map<Endpoint, Agent>();

    return {
        [Symbol.toStringTag]: "ContextAgents",

        agentFor<const T extends EndpointType>(endpoint: Endpoint<T>): Agent.Instance<T> {
            let agent = agents.get(endpoint) as undefined | Agent.Instance<T>;
            if (agent === undefined) {
                agents.set(endpoint, (agent = new endpoint.agentType(endpoint, context)));
            }
            return agent;
        },
    };
}
