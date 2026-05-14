/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { isClientBehavior, clientBrand } from "#behavior/cluster/cluster-behavior-utils.js";
import { SupportedBehaviors } from "../properties/SupportedBehaviors.js";
import { SupportedClientClusters } from "../properties/SupportedClientClusters.js";
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
     * Define an endpoint like this one with additional and/or replacement client cluster declarations.
     */
    withClientClusters(...clientClusters: SupportedClientClusters.List): MutableEndpoint;

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
            const serverArgs: Behavior.Type[] = [];
            const clientArgs: Behavior.Type[] = [];
            for (const b of behaviors) {
                if (isClientBehavior(b)) {
                    clientArgs.push(b);
                } else {
                    serverArgs.push(b);
                }
            }

            return MutableEndpoint({
                ...options,
                behaviors: serverArgs.length ? SupportedBehaviors.extend(this.behaviors, serverArgs) : this.behaviors,
                clientClusters: clientArgs.length
                    ? SupportedClientClusters.extend(this.clientClusters, clientArgs)
                    : this.clientClusters,
            });
        },

        withBehaviors(this: MutableEndpoint, ...behaviors: Behavior.Type[]) {
            return MutableEndpoint({
                ...options,
                behaviors: SupportedBehaviors.extend(this.behaviors, behaviors),
            });
        },

        withClientClusters(this: MutableEndpoint, ...clientClusters: Behavior.Type[]) {
            return MutableEndpoint({
                ...options,
                clientClusters: SupportedClientClusters.extend(this.clientClusters, clientClusters),
            });
        },
    } as unknown as MutableEndpoint.With<
        EndpointType.For<T>,
        T["behaviors"] extends SupportedBehaviors ? T["behaviors"] : {},
        T["clientClusters"] extends SupportedClientClusters ? T["clientClusters"] : {}
    >;
}

export namespace MutableEndpoint {
    type ClientArgs<L extends readonly Behavior.Type[]> = L extends readonly [
        infer F extends Behavior.Type,
        ...infer R extends readonly Behavior.Type[],
    ]
        ? F extends { [k in typeof clientBrand]: true }
            ? readonly [F, ...ClientArgs<R>]
            : ClientArgs<R>
        : readonly [];

    type ServerArgs<L extends readonly Behavior.Type[]> = L extends readonly [
        infer F extends Behavior.Type,
        ...infer R extends readonly Behavior.Type[],
    ]
        ? F extends { [k in typeof clientBrand]: true }
            ? ServerArgs<R>
            : readonly [F, ...ServerArgs<R>]
        : readonly [];

    export type With<
        B extends EndpointType,
        SB extends SupportedBehaviors,
        SC extends SupportedClientClusters = B["clientClusters"],
    > = Omit<B, "behaviors" | "clientClusters" | "defaults" | "set" | "with"> & {
        behaviors: B["behaviors"] & SB;
        clientClusters: SC;

        /**
         * Access default state values.
         */
        defaults: SupportedBehaviors.StateOf<SB>;

        /**
         * Define an endpoint like this one with different defaults.  Only updates values present in the input object.
         */
        set(defaults: SupportedBehaviors.InputStateOf<SB>): With<B, SB, SC>;

        /**
         * Define an endpoint like this one with additional and/or replacement server behaviors.
         */
        withBehaviors<const BL extends SupportedBehaviors.List>(
            ...behaviors: BL
        ): With<B, SupportedBehaviors.With<SB, BL>, SC>;

        /**
         * Define an endpoint like this one with additional and/or replacement client cluster declarations.
         */
        withClientClusters<const CL extends SupportedClientClusters.List>(
            ...clientClusters: CL
        ): With<B, SB, SupportedClientClusters.With<SC, CL>>;

        /**
         * Route server behaviors to the behaviors slot and ClientBehavior arguments to the clientClusters slot.
         */
        with<const Args extends SupportedBehaviors.List>(
            ...args: Args
        ): With<B, SupportedBehaviors.With<SB, ServerArgs<Args>>, SupportedClientClusters.With<SC, ClientArgs<Args>>>;
    };
}
