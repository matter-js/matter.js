/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TlvSchema } from "../tlv/TlvSchema.js";
import type {
    OptionalWritableAttribute,
    OptionalWritableFabricScopedAttribute,
    WritableAttribute,
    WritableFabricScopedAttribute,
} from "./Cluster.js";
import type { ClusterNamespace, ClusterTyping } from "./ClusterNamespace.js";
import type { ClusterType } from "./ClusterType.js";

/**
 * Bridge type that maps a legacy {@link ClusterType} + {@link ClusterTyping} into a
 * {@link ClusterTyping}-compatible shape so that `ClusterBehavior.for()` can accept
 * either old-style `ClusterType` objects or new-style `ClusterNamespace` objects.
 *
 * Converts the base cluster's attributes/events plus any extension components into
 * the unified `Components` tuple format used by the new type system.  Commands come
 * from `I.Components` (the interface typing) since `ClusterType` doesn't carry method
 * signatures.
 */
export type ClusterTypeBridge<C extends ClusterType, I extends ClusterTyping> = Omit<
    I,
    "Attributes" | "Events" | "Features" | "SupportedFeatures" | "Components"
> & {
    Attributes: AttrValuesOf<C["attributes"]> & ExtAttrValuesOf<ExtensionsOf<C>>;
    Events: EventValuesOf<C["events"]> & ExtEventValuesOf<ExtensionsOf<C>>;
    Features: FeatureNamesOf<C["features"]>;
    SupportedFeatures: C["supportedFeatures"];
    Components: MergeComponents<
        [
            {
                flags: {};
                attributes: MandatoryAttrs<C["attributes"]> & OptionalAttrs<C["attributes"]>;
                events: MandatoryEvents<C["events"]> & OptionalEvents<C["events"]>;
            },
            ...ExtComponents<ExtensionsOf<C>>,
        ],
        InterfaceComponents<I>
    >;
};

/**
 * Extract Components from the interface typing if it has them.
 */
type InterfaceComponents<I> = I extends { Components: infer C extends ClusterNamespace.Component[] } ? C : [];

/**
 * Merge bridge-computed components (attributes/events from ClusterType) with interface
 * components (commands from hand-written interface).  For each bridge component, find the
 * matching interface component (same flags) and merge its `commands` in.
 */
type MergeComponents<
    Bridge extends ClusterNamespace.Component[],
    Iface extends ClusterNamespace.Component[],
> = Bridge extends [infer B extends ClusterNamespace.Component, ...infer BRest extends ClusterNamespace.Component[]]
    ? [B & FindMatchingComponent<B["flags"], Iface>, ...MergeComponents<BRest, Iface>]
    : AppendUnmatched<Bridge, Iface>;

/**
 * Find the component in Iface whose flags match F, returning just its commands.
 */
type FindMatchingComponent<F, Iface extends ClusterNamespace.Component[]> = Iface extends [
    infer C extends ClusterNamespace.Component,
    ...infer Rest extends ClusterNamespace.Component[],
]
    ? F extends C["flags"]
        ? C["flags"] extends F
            ? C extends { commands: infer M }
                ? { commands: M }
                : {}
            : FindMatchingComponent<F, Rest>
        : FindMatchingComponent<F, Rest>
    : {};

/**
 * Append interface components that don't have a matching bridge component (command-only components).
 */
type AppendUnmatched<
    Bridge extends ClusterNamespace.Component[],
    Iface extends ClusterNamespace.Component[],
> = Iface extends [infer C extends ClusterNamespace.Component, ...infer Rest extends ClusterNamespace.Component[]]
    ? HasMatchingFlags<C["flags"], Bridge> extends true
        ? AppendUnmatched<Bridge, Rest>
        : [C, ...AppendUnmatched<Bridge, Rest>]
    : [];

type HasMatchingFlags<F, Bridge extends ClusterNamespace.Component[]> = Bridge extends [
    infer B extends ClusterNamespace.Component,
    ...infer Rest extends ClusterNamespace.Component[],
]
    ? F extends B["flags"]
        ? B["flags"] extends F
            ? true
            : HasMatchingFlags<F, Rest>
        : HasMatchingFlags<F, Rest>
    : false;

type AttrValueOf<A> = A extends { schema: TlvSchema<infer T> } ? T : never;

type AttrValuesOf<R> = { [K in keyof R]: AttrValueOf<R[K]> };

type EventValuesOf<R> = { [K in keyof R]: AttrValueOf<R[K]> };

type WritableAttrKeys<R> = {
    [K in keyof R]: R[K] extends
        | WritableAttribute<any, any>
        | OptionalWritableAttribute<any, any>
        | WritableFabricScopedAttribute<any, any>
        | OptionalWritableFabricScopedAttribute<any, any>
        ? K
        : never;
}[keyof R];

type ReadonlyAttrKeys<R> = Exclude<keyof R, WritableAttrKeys<R>>;

type MandatoryAttrs<R> = {
    readonly [K in MandatoryKeysOf<R> & ReadonlyAttrKeys<R>]: AttrValueOf<R[K]>;
} & {
    [K in MandatoryKeysOf<R> & WritableAttrKeys<R>]: AttrValueOf<R[K]>;
};

type OptionalAttrs<R> = {
    readonly [K in OptionalKeysOf<R> & ReadonlyAttrKeys<R>]?: AttrValueOf<R[K]>;
} & {
    [K in OptionalKeysOf<R> & WritableAttrKeys<R>]?: AttrValueOf<R[K]>;
};

type MandatoryEvents<R> = {
    [K in MandatoryKeysOf<R>]: AttrValueOf<R[K]>;
};

type OptionalEvents<R> = {
    [K in OptionalKeysOf<R>]?: AttrValueOf<R[K]>;
};

type MandatoryKeysOf<R> = {
    [K in keyof R]: R[K] extends { optional: true } ? never : K;
}[keyof R] &
    string;

type OptionalKeysOf<R> = {
    [K in keyof R]: R[K] extends { optional: true } ? K : never;
}[keyof R] &
    string;

type FeatureNamesOf<F> = Capitalize<keyof F & string>;

type ExtensionsOf<C extends ClusterType> = C extends { extensions: infer E extends readonly ClusterType.Extension[] }
    ? E
    : [];

type ExtFlags<E extends ClusterType.Extension> = E["flags"];

type ExtComponents<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? [ExtComponentEntry<E>, ...ExtComponents<Rest>]
    : [];

type ExtComponentEntry<E extends ClusterType.Extension> = {
    flags: ExtFlags<E>;
} & (E["component"] extends { attributes: infer A } ? { attributes: MandatoryAttrs<A> & OptionalAttrs<A> } : {}) &
    (E["component"] extends { events: infer Ev } ? { events: MandatoryEvents<Ev> & OptionalEvents<Ev> } : {});

type ExtAttrValuesOf<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? (E["component"] extends { attributes: infer A } ? AttrValuesOf<A> : {}) & ExtAttrValuesOf<Rest>
    : {};

type ExtEventValuesOf<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? (E["component"] extends { events: infer Ev } ? EventValuesOf<Ev> : {}) & ExtEventValuesOf<Rest>
    : {};

/**
 * Extract {@link ClusterTyping} from either a {@link ClusterNamespace.Concrete} (which carries `Typing` directly)
 * or a legacy {@link ClusterType} (bridged via {@link ClusterTypeBridge}).
 */
export type TypingOf<C> = C extends { Typing: infer N extends ClusterTyping }
    ? N
    : C extends ClusterType
      ? ClusterTypeBridge<C, {}>
      : ClusterTyping;
