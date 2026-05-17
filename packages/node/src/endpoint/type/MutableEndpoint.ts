/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { isClientBehavior } from "#behavior/cluster/cluster-behavior-utils.js";
import { Logger } from "@matter/general";
import { SupportedBehaviors } from "../properties/SupportedBehaviors.js";
import { SupportedClientClusters } from "../properties/SupportedClientClusters.js";
import { EndpointType } from "./EndpointType.js";

const logger = Logger.get("MutableEndpoint");

/**
 * A MutableEndpoint is an EndpointType with factory functions that make it convenient to reconfigure the endpoint.
 *
 * Note: mandatory client clusters from `requirements.client.mandatory` are auto-registered into the
 * `clientClusters` slot at runtime but do not surface in the static type — the slot type reflects only
 * explicitly-supplied `clientClusters` or `.withClientClusters(...)` additions.
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
     * Route server behaviors to the behaviors slot and ClientBehavior arguments to the clientClusters slot.
     */
    with(...behaviors: SupportedBehaviors.List): MutableEndpoint;
}

/**
 * Define a new type of endpoint with factory functions.
 */
export function MutableEndpoint<const T extends EndpointType.Options>(options: T) {
    const type = EndpointType(options);

    // Auto-merge is runtime-only; clientClusters static type reflects only what options provided.
    let clientClusters: SupportedClientClusters = type.clientClusters;
    const mandatoryClients: SupportedBehaviors = options.requirements?.client?.mandatory ?? {};
    if (Object.keys(mandatoryClients).length > 0) {
        const merged = SupportedClientClusters.extend(clientClusters, Object.values(mandatoryClients));
        const added = Object.keys(merged).filter(k => !(k in clientClusters));
        if (added.length > 0) {
            clientClusters = merged;
            logger.debug(
                `Auto-registered mandatory client cluster(s) [${added.join(", ")}] for device type ${type.name}`,
            );
        }
    }

    let defaults: undefined | Record<string, object>;

    return {
        ...type,
        clientClusters,

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
         * Define an endpoint like this one with additional behaviors. ClientBehavior arguments are routed to the
         * clientClusters slot at runtime; the static type widens them like ordinary server behaviors. For typed access
         * to the resulting clientClusters slot, use {@link withClientClusters} instead.
         */
        with<const BL extends SupportedBehaviors.List>(...behaviors: BL): With<B, SupportedBehaviors.With<SB, BL>, SC>;
    };
}
