/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import type { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import type { Agent } from "#endpoint/Agent.js";
import { EndpointVariableService } from "#endpoint/EndpointVariableService.js";
import { MaybePromise } from "@matter/general";
import type { Endpoint } from "../Endpoint.js";

/**
 * Base class for {@link Endpoint} initialization services.
 */
export abstract class EndpointInitializer {
    /**
     * Assign the ID and number of an {@link Endpoint} below a node root before the endpoint installs.  A node root
     * reserves during its own initialization instead.  An implementation may run it again for an endpoint that already
     * holds both, which must leave the endpoint unchanged.
     *
     * @internal
     */
    reserveDescendant(_endpoint: Endpoint) {}

    /**
     * Initialize a {@link Endpoint}.
     */
    initializeDescendant(_endpoint: Endpoint) {}

    /**
     * Erase storage for a {@link Endpoint}.
     */
    abstract eraseDescendant(_endpoint: Endpoint): Promise<void>;

    /**
     * Invoked when a {@link Endpoint} closes; its storage and number reservation stay
     */
    abstract deactivateDescendant(_endpoint: Endpoint): Promise<void>;

    /**
     * Create backing for a behavior of a descendent.
     *
     * @param endpoint the {@link Endpoint} the behavior belongs to
     * @param type the {@link Behavior} type
     * @returns a new {@link BehaviorBacking}
     */
    abstract createBacking(endpoint: Endpoint, type: Behavior.Type): BehaviorBacking;

    /**
     * Environmental configuration if supported on this node.
     */
    variableService?: EndpointVariableService;

    /**
     * Invoked after behaviors are initialized but before the initialization transaction commits.
     */
    behaviorsInitialized(_agent: Agent): MaybePromise {}

    /**
     * Invoked after the parts of an endpoint are initialized but before the endpoint's construction completes, so an
     * error fails the construction.
     */
    partsInitialized(_endpoint: Endpoint): MaybePromise {}
}
