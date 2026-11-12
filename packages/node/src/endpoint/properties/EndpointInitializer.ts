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
     * Throw to refuse the call of the lifecycle verb {@link verb} on {@link endpoint}.  Runs synchronously before the
     * verb changes any state, so a refusal emits no lifecycle change.  Admits every call by default.
     *
     * Not consulted when an endpoint closes or deletes its parts itself, as a node does in its teardown or erase, when
     * {@link Endpoint.add} closes a part that failed to initialize, nor for an endpoint the peer of a client node no
     * longer reports.
     */
    assertVerbAdmitted(_endpoint: Endpoint, _verb: EndpointInitializer.Verb) {}

    /**
     * Prepare {@link Endpoint.erase} of an endpoint and its parts.  Runs before the endpoint resets; the endpoint may
     * have crashed.  The wipe keeps the endpoint numbers.
     */
    abstract prepareEraseDescendant(_endpoint: Endpoint): Promise<EndpointInitializer.Erasure>;

    /**
     * Prepare {@link Endpoint.delete} of an endpoint and its parts.  The wipe erases their persisted data and, on a
     * server node, releases their endpoint numbers.
     */
    abstract prepareDeleteDescendant(_endpoint: Endpoint): Promise<EndpointInitializer.Erasure>;

    /**
     * Invoked once an {@link Endpoint} that closes or is deleted is destroyed.  A close keeps its storage and number
     * reservation.
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

export namespace EndpointInitializer {
    /**
     * A lifecycle verb of an {@link Endpoint} that {@link EndpointInitializer.assertVerbAdmitted} may refuse.
     */
    export type Verb = "erase" | "delete" | "close";

    /**
     * The storage side of {@link Endpoint.erase} and {@link Endpoint.delete}.
     */
    export interface Erasure {
        /**
         * Whether an erase deletes the parts of the endpoint before the endpoint resets, so the owner of the structure
         * creates them again.  The deletes run while the index of the node is live, so each reports its "delete"
         * change.  A failed part delete fails the wipe.  Only an erase reads this.
         */
        deletesParts?: boolean;

        /**
         * Erase the persisted data of the endpoint and its parts.  Runs after the endpoint reset.
         */
        wipe(): Promise<void>;

        /**
         * Complete the erase or delete.  Runs last, once the verb released the lifecycle mutexes, so it may wait for
         * work that needs them.  Runs also when an earlier step failed or the restart was skipped, but not for an
         * erase that a delete took over.  A failure rejects the verb with the failures of the earlier steps.
         */
        finish?(): Promise<void>;
    }
}
