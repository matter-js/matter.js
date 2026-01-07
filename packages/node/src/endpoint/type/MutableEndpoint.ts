/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { SupportedBehaviors } from "../properties/SupportedBehaviors.js";
import { EndpointType } from "./EndpointType.js";

/**
 * A MutableEndpoint is an EndpointType with factory functions that make it convenient to reconfigure the endpoint.
 */
export interface MutableEndpoint extends EndpointType {
    /**
     * Access default state values.
     */
    defaults: {};

    /**
     * Define an endpoint like this one with different defaults.  Only updates values present in the input object.
     */
    set(defaults: {}): MutableEndpoint;

    /**
     * Define an endpoint like this one with additional and/or replacement server behaviors.
     */
    withBehaviors(...behaviors: SupportedBehaviors.List): MutableEndpoint;

    /**
     * Alias for {@link withBehaviors}.
     */
    with(...behaviors: SupportedBehaviors.List): MutableEndpoint;
}

/**
 * Define a new type of endpoint with factory functions.
 */
export function MutableEndpoint<const T extends EndpointType.Options>(options: T) {
    const type = EndpointType(options);
    let defaults: undefined | Record<string, object>;

    return {
        ...type,

        get defaults() {
            if (!defaults) {
                defaults = {} as Record<string, object>;

                for (const name in type.behaviors) {
                    defaults[name] = (type.behaviors[name] as Behavior.Type).defaults;
                }
            }

            return defaults;
        },

        set(this: MutableEndpoint, defaults: SupportedBehaviors.InputStateOf<typeof type.behaviors>) {
            const newBehaviors = Array<Behavior.Type>();

            for (const name in this.behaviors) {
                const updates = (defaults as any)[name];
                const behavior = this.behaviors[name];
                if (updates) {
                    newBehaviors.push(behavior.set(updates));
                }
            }

            return this.with(...newBehaviors);
        },

        with(this: MutableEndpoint, ...behaviors: Behavior.Type[]) {
            return MutableEndpoint({
                ...options,
                behaviors: SupportedBehaviors.extend(this.behaviors, behaviors),
            });
        },

        withBehaviors(this: MutableEndpoint, ...behaviors: Behavior.Type[]) {
            return this.with(...behaviors);
        },
    } as unknown as MutableEndpoint.With<
        EndpointType.For<T>,
        T["behaviors"] extends SupportedBehaviors ? T["behaviors"] : {}
    >;
}

export namespace MutableEndpoint {
    export type With<B extends EndpointType, SB extends SupportedBehaviors> = Omit<
        B,
        "behaviors" | "defaults" | "set" | "with"
    > & {
        behaviors: B["behaviors"] & SB;

        /**
         * Access default state values.
         */
        defaults: SupportedBehaviors.StateOf<SB>;

        /**
         * Define an endpoint like this one with different defaults.  Only updates values present in the input object.
         */
        set(defaults: SupportedBehaviors.InputStateOf<SB>): With<B, SB>;

        /**
         * Define an endpoint like this one with additional and/or replacement server behaviors.
         */
        withBehaviors<const BL extends SupportedBehaviors.List>(
            ...behaviors: BL
        ): With<B, SupportedBehaviors.With<SB, BL>>;

        /**
         * Alias for {@link withBehaviors}.
         */
        with<const BL extends SupportedBehaviors.List>(...behaviors: BL): With<B, SupportedBehaviors.With<SB, BL>>;
    };
}
