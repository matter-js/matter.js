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
    type ComponentsOf<N extends ClusterTyping> = N extends {
        Components: infer C extends ClusterNamespace.Component[];
    }
        ? C
        : [];

    /**
     * Attribute properties derived from applicable Components.
     *
     * When components carry per-component attribute interfaces (`attrs`), compose them via recursive intersection
     * — this preserves IDE go-to-definition and JSDoc.  Otherwise fall back to key classification from the flat
     * `Attributes` interface (for hand-crafted clusters without per-component interfaces).
     */
    type AttributeProperties<N extends ClusterTyping> = AppliedAttrsOf<
        ComponentsOf<N>,
        ClusterNamespace.SupportedFeaturesOf<N>
    >;

    /**
     * Recursively intersect per-component attribute interfaces from applicable components.
     *
     * Mirrors {@link ClusterInterface.AppliedMethodsOf} for commands.
     */
    type AppliedAttrsOf<CA extends ClusterNamespace.Component[], S> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? (S extends C["flags"] ? (C extends { attributes: infer A } ? A : {}) : {}) & AppliedAttrsOf<R, S>
        : {};

    /**
     * Instance type for "complete" state — all components included.
     *
     * Base-component (flags: {}) attrs are intersected directly (preserving their mandatory/optional modifiers).
     * Non-base component attrs are wrapped in Partial.
     */
    export type Complete<N extends ClusterTyping = ClusterTyping, B extends Behavior.Type = Behavior.Type> = Omit<
        InstanceType<B["State"]>,
        ClusterNamespace.AttrKeysOf<N>
    > &
        CompleteAttributeProperties<N>;

    /**
     * Intersect base-component attribute interfaces directly, Partial all non-base.
     */
    type CompleteAttributeProperties<N extends ClusterTyping> = AppliedBaseAttrs<ComponentsOf<N>> &
        Partial<AppliedNonBaseAttrs<ComponentsOf<N>>>;

    /**
     * Intersect attribute interfaces from base components (flags: {}).
     */
    type AppliedBaseAttrs<CA extends ClusterNamespace.Component[]> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? ({} extends C["flags"] ? (C extends { attributes: infer A } ? A : {}) : {}) & AppliedBaseAttrs<R>
        : {};

    /**
     * Intersect attribute interfaces from non-base components (flags !== {}).
     */
    type AppliedNonBaseAttrs<CA extends ClusterNamespace.Component[]> = CA extends [
        infer C extends ClusterNamespace.Component,
        ...infer R extends ClusterNamespace.Component[],
    ]
        ? ({} extends C["flags"] ? {} : C extends { attributes: infer A } ? A : {}) & AppliedNonBaseAttrs<R>
        : {};
}
