/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterNamespace, ClusterTyping } from "@matter/types";
import { AttributeId, BitSchema, CommandId, TypeFromPartialBitSchema } from "@matter/types";
import type { Behavior } from "../Behavior.js";

/**
 * Instance type for complete (endpoint + fabric) state.
 */
export type ClusterState<
    N extends ClusterTyping = ClusterTyping,
    B extends Behavior.Type = Behavior.Type,
> = ClusterState.Type<N, B>;

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
    export type Type<N extends ClusterTyping = ClusterTyping, B extends Behavior.Type = Behavior.Type> =
        // Keep properties *not* from attributes of the old cluster
        Omit<InstanceType<B["State"]>, ClusterNamespace.AttrKeysOf<N>> &
            // Add properties from attributes of the new cluster
            AttributeProperties<N>;

    /**
     * Extract Components tuple from namespace.
     */
    export type ComponentsOf<N extends ClusterTyping> = N extends {
        Components: infer C extends ClusterNamespace.Component[];
    }
        ? C
        : [];

    /**
     * Attribute properties from applicable components.
     *
     * Non-applicable component attributes are **absent** (not optional).  Optionality (`?`) and writability
     * (`readonly`) come directly from the component interfaces — no key classification needed.
     *
     * The outer conditional causes TypeScript to defer resolution for generic N, which is required for
     * overload compatibility in {@link ClusterBehavior.for}.
     */
    type AttributeProperties<N extends ClusterTyping> = N extends { Components: ClusterNamespace.Component[] }
        ? WritableApplicableAttrs<ComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>
        : {};

    /**
     * Intersect writable attribute interfaces from applicable components.
     *
     * Like {@link ClusterNamespace.ApplicableAttrs} but strips `readonly` per-component before intersecting.
     * This ensures that when `enable()` injects a synthetic component with a required key, the intersection
     * correctly makes that key required (homomorphic mapped types over intersections lose this otherwise).
     */
    type WritableApplicableAttrs<CA extends ClusterNamespace.Component[], S> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? (S extends C["flags"] ? (C extends { attributes: infer A } ? { -readonly [K in keyof A]: A[K] } : {}) : {}) &
              WritableApplicableAttrs<R, S>
        : {};

    /**
     * All attribute keys across all components (used by Complete types).
     */
    type AllAttrKeys<CA extends ClusterNamespace.Component[]> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? (C extends { attributes: infer A } ? keyof A & string : never) | AllAttrKeys<R>
        : never;

    /**
     * Instance type for "complete" state — all components included.
     *
     * Base-component (flags: {}) mandatory attrs stay mandatory; all others are optional.
     */
    export type Complete<N extends ClusterTyping = ClusterTyping, B extends Behavior.Type = Behavior.Type> = Omit<
        InstanceType<B["State"]>,
        ClusterNamespace.AttrKeysOf<N>
    > &
        CompleteAttributeProperties<N>;

    /**
     * Mandatory keys from base components (flags: {}) only.
     */
    type CompleteBaseMandatoryAttrKeys<CA extends ClusterNamespace.Component[]> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ?
              | ({} extends C["flags"]
                    ? C extends { attributes: infer A }
                        ? ClusterNamespace.RequiredKeys<A>
                        : never
                    : never)
              | CompleteBaseMandatoryAttrKeys<R>
        : never;

    /**
     * Complete attribute properties: base-mandatory attrs are mandatory, everything else is optional.
     */
    type CompleteAttributeProperties<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? { [K in CompleteBaseMandatoryAttrKeys<ComponentsOf<N>> & keyof A]: Exclude<A[K], undefined> } & {
              [K in Exclude<AllAttrKeys<ComponentsOf<N>>, CompleteBaseMandatoryAttrKeys<ComponentsOf<N>>> &
                  keyof A]?: Exclude<A[K], undefined>;
          }
        : {};
}
