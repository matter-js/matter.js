/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterType, TypeFromSchema } from "#types";
import { AttributeId, BitSchema, CommandId, TypeFromPartialBitSchema } from "#types";
import type { Behavior } from "../Behavior.js";
import type { ClusterOf } from "./cluster-behavior-utils.js";

/**
 * Instance type for complete (endpoint + fabric) state.
 */
export type ClusterState<C extends ClusterType, B extends Behavior.Type> = ClusterState.Type<C, B>;

/**
 * State values for global attributes.
 *
 * These properties are present in the state object for all cluster behaviors.  We manage them automatically and they
 * would add unnecessary noise in the API so we omit them from public types.  But they are accessible in TypeScript by
 * casting state to GlobalAttributeState.
 */
export interface GlobalAttributeState {
    clusterRevision: number;
    featureMap: TypeFromPartialBitSchema<BitSchema>;
    attributeList: AttributeId[];
    acceptedCommandList: CommandId[];
    generatedCommandList: CommandId[];
}

export namespace ClusterState {
    /**
     * Instance type for ClusterBehavior state.
     */
    export type Type<C extends ClusterType, B extends Behavior.Type> =
        // Keep properties *not* from attributes of the old cluster
        Omit<InstanceType<B["State"]>, keyof PropertiesOf<ClusterOf<B>>> &
            // Add properties from attributes of the old cluster
            PropertiesOf<C>;

    /**
     * Properties a cluster contributes state.
     */
    export type PropertiesOf<C> = PropertiesOfAttributes<ClusterType.AttributesOf<C>>;

    export type PropertiesOfAttributes<A extends Record<string, ClusterType.Attribute>> = {
        -readonly [N in keyof A as A[N] extends { fixed: true }
            ? never
            : A[N] extends { optional: true }
              ? never
              : N]: TypeFromSchema<A[N]["schema"]>;
    } & {
        -readonly [N in keyof A as A[N] extends { fixed: true }
            ? never
            : A[N] extends { optional: true }
              ? N
              : never]?: TypeFromSchema<A[N]["schema"]>;
    } & {
        -readonly [N in keyof A as A[N] extends { fixed: true }
            ? A[N] extends { optional: true }
                ? never
                : N
            : never]: TypeFromSchema<A[N]["schema"]>;
    } & {
        -readonly [N in keyof A as A[N] extends { fixed: true }
            ? A[N] extends { optional: true }
                ? N
                : never
            : never]?: TypeFromSchema<A[N]["schema"]>;
    };
}
