/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { isClientBehavior } from "#behavior/cluster/cluster-behavior-utils.js";
import { camelize, capitalize, ImplementationError } from "@matter/general";

/**
 * A set of client cluster declarations an endpoint supports.
 *
 * Unlike {@link SupportedBehaviors}, entries here are metadata only. They are not instantiated by
 * `BehaviorBacking` on a ServerNode endpoint. Their presence:
 *
 * - Populates the `clientList` attribute of the Descriptor cluster.
 * - Provides a discoverable surface (`endpoint.type.clientClusters`) for the Step 2 binding service
 *   to pre-install cluster clients on a peer `ClientNode` / `GroupNode`.
 */
export type SupportedClientClusters = Record<string, Behavior.Type>;

/**
 * Create SupportedClientClusters from a list of ClientBehavior types.
 */
export function SupportedClientClusters<const T extends SupportedClientClusters.List>(...types: T) {
    const result = {} as SupportedClientClusters;

    addClientClusters(result, types);

    return result as SupportedClientClusters.MapOf<T>;
}

export namespace SupportedClientClusters {
    export type List = readonly Behavior.Type[];

    /**
     * Create a new list with additional client cluster types, replacing any prior entry with the same id.
     */
    export function extend<const Current extends SupportedClientClusters, const Added extends List>(
        currentTypes: Current,
        newTypes: Added,
    ) {
        const result = { ...currentTypes } as SupportedClientClusters;

        addClientClusters(result, newTypes);

        return result as unknown as With<Current, Added>;
    }

    export type With<CurrentT extends SupportedClientClusters, NewT extends List> = Omit<CurrentT, NewT[number]["id"]> &
        MapOf<NewT>;

    export type MapOf<T extends List> = T extends readonly [infer F extends Behavior.Type]
        ? { readonly [K in F["id"]]: F }
        : T extends readonly [infer F extends Behavior.Type, ...infer R extends List]
          ? { readonly [K in F["id"]]: F } & MapOf<R>
          : {};
}

function addClientClusters(target: SupportedClientClusters, types: SupportedClientClusters.List) {
    for (const type of types) {
        if (typeof type.id !== "string") {
            throw new ImplementationError("ClientBehavior type has no ID");
        }

        if (!/^[a-z]/.test(type.id)) {
            throw new ImplementationError(
                `ClientBehavior ID "${type.id}" must start with a lowercase letter (for example "${camelize(type.id)}")`,
            );
        }

        if (!isClientBehavior(type)) {
            const id = capitalize(type.id);
            throw new ImplementationError(
                `Cluster "${type.id}" was registered as a client cluster but was not created with ClientBehavior(...). Use ${id}Client, not ${id}Behavior`,
            );
        }

        target[type.id] = type;
    }
}
