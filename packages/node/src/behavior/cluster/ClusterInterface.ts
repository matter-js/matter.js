/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MaybePromise } from "#general";
import type { BitSchema, ClusterComposer, ClusterType, TypeFromPartialBitSchema, TypeFromSchema } from "#types";

/**
 * This type defines methods for a behavior grouped by named cluster component.
 *
 * Ideally we would do this using a simple mapped type.  Unfortunately as of TypeScript 5.2 there is no way to define a
 * method using a mapped type. Instead the mapped type defines function properties.
 *
 * Function properties work identically to methods semantically but TypeScript doesn't allow you to override them with
 * standard methods (see error TS2425).
 *
 * Thus we are forced to generate an interface for every cluster component and assemble based on selected features using
 * logic that mirrors {@link ClusterComposer.Of}.
 *
 * Note that we only need to do this for commands.  The public interface for attributes and events consists solely of
 * properties so we generate using mapped types.  This is handled by ClusterState and ClusterEvents respectively.
 *
 * If TS team ever fixes:
 *
 *   https://github.com/microsoft/TypeScript/issues/27965
 *
 * ...then we can remove the interface and just use {@link ClusterInterface.MappedMethodsOf}.
 *
 * This appears to be a duplicate (but is still open):
 *
 *   https://github.com/microsoft/TypeScript/issues/27689
 *
 * Proposed solution is to just remove the error:
 *
 *   https://github.com/microsoft/TypeScript/issues/48125
 *
 */
export type ClusterInterface<F extends BitSchema = {}> = {
    components: ClusterInterface.Component<F>[];
};

export namespace ClusterInterface {
    export const Empty = { components: [] };
    export interface Empty {
        components: [];
    }

    export interface Component<F extends BitSchema = {}> {
        flags: TypeFromPartialBitSchema<F>;
        methods: {};
    }

    export type InterfaceOf<B> = B extends { Interface: infer I extends ClusterInterface } ? I : ClusterInterface;

    export type MethodsOf<I extends ClusterInterface, C extends ClusterType> =
        // This is the workaround for TS issue #27965
        InterfaceMethodsOf<I, C["supportedFeatures"]> &
            // Fall back to mapping for methods not defined in an interface
            Omit<MappedMethodsOf<C["commands"]>, keyof InterfaceMethodsOf<I, C["supportedFeatures"]>>;

    export type InterfaceMethodsOf<
        I extends ClusterInterface,
        S extends ClusterComposer.FeatureFlags,
    > = ClusterInterface extends I ? {} : AppliedMethodsOf<ApplicableComponents<I["components"], S>>;

    export type AppliedMethodsOf<CA extends Component[]> = CA extends [
        infer C extends Component,
        ...infer R extends Component[],
    ]
        ? C["methods"] & AppliedMethodsOf<R>
        : {};

    export type ApplicableComponents<CA extends Component[], S extends ClusterComposer.FeatureFlags> = CA extends [
        infer C extends Component,
        ...infer R extends Component[],
    ]
        ? S extends C["flags"]
            ? [C, ...ApplicableComponents<R, S>]
            : ApplicableComponents<R, S>
        : [];

    export type MethodForCommand<C extends ClusterType.Command> = (
        request: TypeFromSchema<C["requestSchema"]>,
    ) => MaybePromise<TypeFromSchema<C["responseSchema"]>>;

    export type MappedMethodsOf<C extends Record<string, ClusterType.Command>> = string extends keyof C
        ? {}
        : {
              readonly [K in keyof C]: MethodForCommand<C[K]>;
          };
}
