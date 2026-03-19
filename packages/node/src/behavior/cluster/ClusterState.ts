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
     * Extract Attributes.Components tuple from namespace.
     */
    export type AttributesComponentsOf<N extends ClusterTyping> = N extends {
        Attributes: { Components: infer C extends ClusterNamespace.ElementComponent[] };
    }
        ? C
        : [];

    /**
     * N-driven attribute properties: mandatory vs optional from Components + value types from Attributes.
     */
    type AttributeProperties<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? {
              [K in (
                  | MandatoryAttrKeys<AttributesComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>
                  | EnabledAttrKeys<N>
              ) &
                  keyof A]: A[K];
          } & {
              [K in Exclude<
                  OptionalAttrKeys<AttributesComponentsOf<N>, ClusterNamespace.SupportedFeaturesOf<N>>,
                  EnabledAttrKeys<N>
              > &
                  keyof A]?: A[K];
          }
        : {};

    /**
     * Collect mandatory attribute keys from applicable components.
     */
    type MandatoryAttrKeys<CA extends ClusterNamespace.ElementComponent[], S> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | (S extends C["flags"] ? (C extends { mandatory: infer M extends string } ? M : never) : never)
              | MandatoryAttrKeys<R, S>
        : never;

    /**
     * All attribute keys across all components.
     */
    type AllAttrKeys<CA extends ClusterNamespace.ElementComponent[]> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | (C extends { mandatory: infer M extends string } ? M : never)
              | (C extends { optional: infer O extends string } ? O : never)
              | AllAttrKeys<R>
        : never;

    /**
     * Optional = all keys minus mandatory.
     */
    type OptionalAttrKeys<CA extends ClusterNamespace.ElementComponent[], S> = Exclude<
        AllAttrKeys<CA>,
        MandatoryAttrKeys<CA, S>
    >;

    /**
     * Extract keys marked as enabled on the namespace (e.g. via `enable()` or `alter()`).
     */
    type EnabledAttrKeys<N> = N extends { Attributes: { Enabled: infer K extends string } } ? K : never;

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
    type CompleteBaseMandatoryAttrKeys<CA extends ClusterNamespace.ElementComponent[]> = CA extends [
        infer C extends ClusterNamespace.ElementComponent,
        ...infer R extends ClusterNamespace.ElementComponent[],
    ]
        ?
              | ({} extends C["flags"] ? (C extends { mandatory: infer M extends string } ? M : never) : never)
              | CompleteBaseMandatoryAttrKeys<R>
        : never;

    /**
     * Complete attribute properties: base-mandatory attrs are mandatory, everything else is optional.
     */
    type CompleteAttributeProperties<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? { [K in CompleteBaseMandatoryAttrKeys<AttributesComponentsOf<N>> & keyof A]: A[K] } & {
              [K in Exclude<
                  AllAttrKeys<AttributesComponentsOf<N>>,
                  CompleteBaseMandatoryAttrKeys<AttributesComponentsOf<N>>
              > &
                  keyof A]?: A[K];
          }
        : {};
}
