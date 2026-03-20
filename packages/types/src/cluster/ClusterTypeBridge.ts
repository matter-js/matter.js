/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TlvSchema } from "../tlv/TlvSchema.js";
import type { ClusterTyping } from "./ClusterNamespace.js";
import type { ClusterType } from "./ClusterType.js";

/**
 * Bridge type that maps a legacy {@link ClusterType} + {@link ClusterTyping} into a
 * {@link ClusterTyping}-compatible shape so that `ClusterBehavior.for()` can accept
 * either old-style `ClusterType` objects or new-style `ClusterNamespace` objects.
 *
 * Converts the base cluster's attributes/events plus any extension components into
 * the `Components` tuple format used by the new type system.
 */
export type ClusterTypeBridge<C extends ClusterType, I extends ClusterTyping> = I & {
    Attributes: AttrValuesOf<C["attributes"]> &
        ExtAttrValuesOf<ExtensionsOf<C>> & {
            Components: [
                {
                    flags: {};
                    mandatory: MandatoryKeysOf<C["attributes"]>;
                    optional: OptionalKeysOf<C["attributes"]>;
                },
                ...ExtAttrComponents<ExtensionsOf<C>>,
            ];
        };
    Events: EventValuesOf<C["events"]> &
        ExtEventValuesOf<ExtensionsOf<C>> & {
            Components: [
                {
                    flags: {};
                    mandatory: MandatoryKeysOf<C["events"]>;
                    optional: OptionalKeysOf<C["events"]>;
                },
                ...ExtEventComponents<ExtensionsOf<C>>,
            ];
        };
    Features: FeatureNamesOf<C["features"]>;
    SupportedFeatures: C["supportedFeatures"];
};

type AttrValueOf<A> = A extends { schema: TlvSchema<infer T> } ? T : never;

type AttrValuesOf<R> = { [K in keyof R]: AttrValueOf<R[K]> };

type EventValuesOf<R> = { [K in keyof R]: AttrValueOf<R[K]> };

type MandatoryKeysOf<R> = {
    [K in keyof R]: R[K] extends { optional: true } ? never : K;
}[keyof R] &
    string;

type OptionalKeysOf<R> = {
    [K in keyof R]: R[K] extends { optional: true } ? K : never;
}[keyof R] &
    string;

type FeatureNamesOf<F> = Capitalize<keyof F & string>;

/**
 * Extract the extensions tuple from a ClusterType, defaulting to [].
 */
type ExtensionsOf<C extends ClusterType> = C extends { extensions: infer E extends readonly ClusterType.Extension[] }
    ? E
    : [];

/**
 * Convert extension flags from BitSchema-based `TypeFromPartialBitSchema<F>` to the
 * `{ featureName: true }` format used by Components.  Extension flags only include
 * features that are required (true) or excluded (false), so we can pass them through
 * directly — they're already the right shape.
 */
type ExtFlags<E extends ClusterType.Extension> = E["flags"];

/**
 * Map an extensions tuple to attribute Components — one per extension that has attributes.
 */
type ExtAttrComponents<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? E["component"] extends { attributes: infer A }
        ? [
              { flags: ExtFlags<E>; mandatory: MandatoryKeysOf<A>; optional: OptionalKeysOf<A> },
              ...ExtAttrComponents<Rest>,
          ]
        : ExtAttrComponents<Rest>
    : [];

/**
 * Map an extensions tuple to event Components — one per extension that has events.
 */
type ExtEventComponents<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? E["component"] extends { events: infer Ev }
        ? [
              { flags: ExtFlags<E>; mandatory: MandatoryKeysOf<Ev>; optional: OptionalKeysOf<Ev> },
              ...ExtEventComponents<Rest>,
          ]
        : ExtEventComponents<Rest>
    : [];

/**
 * Collect attribute value types from all extensions.
 */
type ExtAttrValuesOf<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? (E["component"] extends { attributes: infer A } ? AttrValuesOf<A> : {}) & ExtAttrValuesOf<Rest>
    : {};

/**
 * Collect event value types from all extensions.
 */
type ExtEventValuesOf<Exts extends readonly ClusterType.Extension[]> = Exts extends readonly [
    infer E extends ClusterType.Extension,
    ...infer Rest extends readonly ClusterType.Extension[],
]
    ? (E["component"] extends { events: infer Ev } ? EventValuesOf<Ev> : {}) & ExtEventValuesOf<Rest>
    : {};
