/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent } from "#endpoint/Agent.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { MutableSet } from "#general";
import { Behavior } from "../../Behavior.js";

/**
 * Provides access to child endpoints.
 */
export class PartsBehavior extends Behavior implements MutableSet<Endpoint, Endpoint | Agent> {
    static override readonly id = "parts";

    add(child: Endpoint.Definition | Agent) {
        this.endpoint.parts.add(child);
    }

    delete(child: Endpoint | Agent) {
        return this.endpoint.parts.delete(child);
    }

    clear() {
        this.endpoint.parts.clear();
    }

    has(child: Endpoint | Agent) {
        return this.endpoint.parts.has(child);
    }

    indexOf(child: Endpoint | Agent) {
        return this.endpoint.parts.indexOf(child);
    }

    *[Symbol.iterator]() {
        for (const part of this.endpoint.parts) {
            yield part.agentFor(this.context);
        }
    }
}
