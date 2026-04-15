/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterType, ClusterTyping } from "@matter/types";

/**
 * @see {@link ClusterTyping}
 */
export type ClusterInterface = ClusterTyping;

export namespace ClusterInterface {
    export const Empty: ClusterInterface = {};
    export type Empty = ClusterInterface;

    export type Component = ClusterType.Component;

    export type InterfaceOf<B> = B extends { Interface: infer I extends ClusterInterface } ? I : ClusterInterface;

    export type MethodsOf<I extends ClusterInterface> = InterfaceMethodsOf<I, ClusterType.SupportedFeaturesOf<I>>;

    /**
     * All methods from all components, regardless of feature selection.
     */
    export type AllMethodsOf<I extends ClusterInterface> = ClusterInterface extends I
        ? {}
        : AppliedMethodsOf<ComponentsOf<I>>;

    export type ComponentsOf<I extends ClusterInterface> = I extends {
        Components: infer C extends Component[];
    }
        ? C
        : [];

    export type InterfaceMethodsOf<I extends ClusterInterface, S> = ClusterInterface extends I
        ? {}
        : AppliedMethodsOf<ApplicableComponents<ComponentsOf<I>, S>>;

    export type AppliedMethodsOf<CA extends Component[]> = CA extends [
        infer C extends Component,
        ...infer R extends Component[],
    ]
        ? (C extends { commands: infer M } ? M : {}) & AppliedMethodsOf<R>
        : {};

    export type ApplicableComponents<CA extends Component[], S> = CA extends [
        infer C extends Component,
        ...infer R extends Component[],
    ]
        ? S extends C["flags"]
            ? [C, ...ApplicableComponents<R, S>]
            : ApplicableComponents<R, S>
        : [];
}
