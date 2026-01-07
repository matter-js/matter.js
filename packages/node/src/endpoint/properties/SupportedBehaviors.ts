/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { camelize, ImplementationError } from "#general";
import { DescriptorBehavior } from "../../behaviors/descriptor/DescriptorBehavior.js";

/**
 * A set of behaviors an endpoint supports.
 */
export type SupportedBehaviors = Record<string, Behavior.Type>;

/**
 * Create SupportedBehaviors from a list of behavior types.
 */
export function SupportedBehaviors<const T extends SupportedBehaviors.List>(...types: T) {
    const result = {} as SupportedBehaviors;

    addBehaviors(result, types);

    return result as SupportedBehaviors.MapOf<T>;
}

/**
 * Utility functions and definitions for modifying lists of clusters.
 */
export namespace SupportedBehaviors {
    export type List = readonly Behavior.Type[];

    /**
     * Create a new list with additional behaviors, replacing any previous
     * behavior for the same cluster.  Replacement updates the set of supported
     * cluster features.
     *
     * Note: Functional equivalent of With<> but you can't have a method named
     * "with" in a namespace.
     */
    export function extend<const BehaviorsT extends SupportedBehaviors, const NewBehaviorsT extends List>(
        currentTypes: BehaviorsT,
        newTypes: NewBehaviorsT,
    ) {
        const result = { ...currentTypes } as SupportedBehaviors;

        addBehaviors(result, newTypes);

        return result as unknown as With<BehaviorsT, NewBehaviorsT>;
    }

    /**
     * Add or replace behaviors.
     */
    export type With<CurrentT extends SupportedBehaviors, NewT extends List> = Omit<CurrentT, NewT[number]["id"]> &
        MapOf<NewT>;

    /**
     * Convert a List to BehaviorTypes.
     */
    export type MapOf<T extends List> = T extends readonly [infer F extends Behavior.Type]
        ? { readonly [K in F["id"]]: F }
        : T extends readonly [infer F extends Behavior.Type, ...infer R extends List]
          ? { readonly [K in F["id"]]: F } & MapOf<R>
          : {};

    /**
     * Properties of an endpoint contributed by listed behaviors.
     */
    export type EndpointProperties<SB extends SupportedBehaviors> = {
        readonly [K in keyof SB]: InstanceType<SB[K]>;
    };

    /**
     * Compound state for all behaviors.
     */
    export type StateOf<SB extends SupportedBehaviors> = {
        [K in keyof SB]: Behavior.StateOf<SB[K]>;
    } & {
        descriptor: Behavior.StateOf<typeof DescriptorBehavior>;
    };

    /**
     * Compound events for all behaviors.
     */
    export type EventsOf<SB extends SupportedBehaviors> = {
        [K in keyof SB]: Behavior.EventsOf<SB[K]>;
    };

    /**
     * Input version of {@link StateOf}.
     */
    export type InputStateOf<SB extends SupportedBehaviors> = {
        [K in keyof SB]?: Behavior.InputStateOf<SB[K]>;
    } & {
        descriptor?: Behavior.InputStateOf<typeof DescriptorBehavior>;
    };

    /**
     * Patch input version of {@link StateOf}.
     */
    export type StatePatchOf<SB extends SupportedBehaviors> = {
        readonly [K in keyof SB]?: Behavior.PatchStateOf<SB[K]>;
    } & {
        descriptor?: Behavior.PatchStateOf<typeof DescriptorBehavior>;
    };
}

function addBehaviors(target: SupportedBehaviors, types: SupportedBehaviors.List) {
    for (const type of types) {
        if (typeof type.id !== "string") {
            throw new ImplementationError("Behavior type has no ID");
        }
        target[camelize(type.id)] = type;
    }
}
