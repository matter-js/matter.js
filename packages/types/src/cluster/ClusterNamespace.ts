/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OptionalKeys as OptionalKeysType, RequiredKeys as RequiredKeysType } from "@matter/general";
import { camelize } from "@matter/general";
import type { AttributeModel, CommandModel, EventModel } from "@matter/model";
import { ClusterModel, ClusterModifier, GLOBAL_IDS } from "@matter/model";
import type { AttributeId } from "../datatype/AttributeId.js";
import { ClusterId } from "../datatype/ClusterId.js";
import type { CommandId } from "../datatype/CommandId.js";
import type { EventId } from "../datatype/EventId.js";
import type { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";

/**
 * Describes the shape of generated namespace objects for standard Matter clusters (`typeof OnOff`).
 *
 * For many standard clusters, API varies based on configuration such as cluster features.  Matter.js generates this
 * API dynamically based on information stored in these namespaces.  The namespace also conveys compile-time type
 * information.
 *
 * For hand-crafted clusters, decorated classes may be preferable to replicating matter.js's code generation.
 */
export interface ClusterNamespace {
    readonly Typing: ClusterTyping;
    readonly schema: ClusterModel;
    readonly id?: ClusterId;
    readonly name: string;
    readonly revision?: number;
    readonly attributes?: Record<string, ClusterNamespace.Attribute>;
    readonly commands?: Record<string, ClusterNamespace.Command>;
    readonly events?: Record<string, ClusterNamespace.Event>;
    readonly features?: Record<string, ClusterNamespace.Feature>;
}

export namespace ClusterNamespace {
    export interface Component<F extends BitSchema = {}> {
        flags: TypeFromPartialBitSchema<F>;
        attributes?: {};
        commands?: {};
        events?: {};
    }

    export type RequiredKeys<T> = RequiredKeysType<T>;
    export type OptionalKeys<T> = OptionalKeysType<T>;

    export interface Attribute<T = unknown> {
        id: AttributeId;
        name: string;
        schema: AttributeModel;
        readonly __phantom?: T;
    }

    export interface Command<T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown> {
        id: CommandId;
        name: string;
        schema: CommandModel;
        readonly __phantom?: T;
    }

    export interface Event<T = unknown> {
        id: EventId;
        name: string;
        schema: EventModel;
        readonly __phantom?: T;
    }

    export interface Feature {
        id: number;
        name: string;
    }

    /**
     * A {@link ClusterNamespace} with a concrete cluster ID.  Used for behavior types that are known to be associated
     * with a non-abstract cluster.
     */
    export interface Concrete extends ClusterNamespace {
        readonly id: ClusterId;
    }

    /**
     * Default namespace used before a real cluster is assigned.
     */
    export const Unknown: Concrete = {
        Typing: {} as ClusterTyping,
        id: ClusterId(0),
        name: "Unknown",
        schema: new ClusterModel({ name: "Unknown" }),
    };

    export type Attributes<A> = { [K in keyof A]: Attribute };
    export type Commands<C> = { [K in keyof C]: Command };
    export type Events<E> = { [K in keyof E]: Event };
    export type Features<F extends string> = { [K in F]: Feature };

    export type AttributeObjects<A> = { [K in keyof A]: Attribute<A[K]> };
    export type CommandObjects<C> = {
        [K in keyof C]: C[K] extends (...args: unknown[]) => unknown ? Command<C[K]> : Command;
    };
    export type EventObjects<E> = { [K in keyof E]: Event<E[K]> };

    /**
     * Set supported feature flags on a namespace, replacing any previous selection.
     *
     * Uses Omit+& (not bare &) so that chained `.with()` calls replace rather than intersect, matching the
     * runtime behavior of {@link ClusterComposer.WithFeatures}.
     */
    export type WithSupportedFeatures<N extends ClusterTyping, S> = Omit<N, "SupportedFeatures"> & {
        SupportedFeatures: S;
    };

    /**
     * Extract supported feature flags from a namespace, defaulting to {}.
     */
    export type SupportedFeaturesOf<N> = N extends { SupportedFeatures: infer S }
        ? S
        : N extends { Features: infer F extends string }
          ? { [K in Uncapitalize<F>]: false }
          : {};

    /**
     * Derive the feature flags object type from a namespace's Features string union.
     */
    export type FeaturesOf<N> = N extends { Features: infer F extends string }
        ? { [K in Uncapitalize<F>]: boolean }
        : Record<string, boolean>;

    /**
     * Augment a namespace with attribute keys forced mandatory (e.g. via `enable()` or `alter()`).
     */
    export type WithEnabledAttributes<N extends ClusterTyping, K extends string> = N & {
        Attributes: { Enabled: K };
    };

    /**
     * Extract attribute key names from ElementFlags (used by `enable()`).
     */
    export type EnabledAttributeKeysOf<F> = F extends { attributes: infer A } ? keyof A & string : never;

    /**
     * Extract attribute key names made mandatory by Alterations (used by `alter()`).
     */
    export type AlteredMandatoryAttributeKeysOf<A> = A extends { attributes: infer E }
        ? { [K in keyof E & string]: E[K] extends { optional: false } ? K : never }[keyof E & string]
        : never;

    /**
     * Augment a namespace with event keys forced mandatory (e.g. via `enable()`).
     */
    export type WithEnabledEvents<N extends ClusterTyping, K extends string> = N & { Events: { Enabled: K } };

    /**
     * Extract event key names from ElementFlags (used by `enable()`).
     * Input shape: `{ events?: { eventName: true } }`
     */
    export type EnabledEventKeysOf<F> = F extends { events: infer E } ? keyof E & string : never;

    /**
     * Extract event key names made mandatory by Alterations (used by `alter()`).
     * Input shape: `{ events?: { eventName: { optional: false } } }`
     */
    export type AlteredMandatoryEventKeysOf<A> = A extends { events: infer E }
        ? { [K in keyof E & string]: E[K] extends { optional: false } ? K : never }[keyof E & string]
        : never;

    /**
     * Extract attribute key names from a namespace, excluding synthetic keys.
     */
    export type AttrKeysOf<N extends ClusterTyping> = N extends { Attributes: infer A }
        ? Exclude<keyof A & string, "Enabled">
        : never;

    /**
     * Extract command key names from a namespace, excluding synthetic keys.
     */
    export type CommandKeysOf<N extends ClusterTyping> = N extends { Commands: infer C } ? keyof C & string : never;

    /**
     * Extract event key names from a namespace, excluding synthetic keys.
     */
    export type EventKeysOf<N extends ClusterTyping> = N extends { Events: infer E }
        ? Exclude<keyof E & string, "Enabled">
        : never;

    /**
     * Produce a typing with all feature flags set to true.  Used by `complete` to make all component attributes
     * mandatory.
     */
    export type AllFeaturesAsFlags<N extends ClusterTyping> = N extends { Features: infer F extends string }
        ? { [K in Uncapitalize<F>]: true }
        : {};

    /**
     * Valid feature names for a namespace's feature selection.
     */
    export type FeatureSelection<N extends ClusterTyping> = N extends { Features: infer F extends string }
        ? readonly F[]
        : readonly string[];

    /**
     * Convert a feature name tuple to a feature flags object with explicit true/false for all features.
     *
     * Like main's `ClusterComposer.FeaturesAsFlags`, unselected features are explicitly `false` (not absent),
     * so that `S extends C["flags"]` matches components with `{ offOnly: false }` when offOnly is not selected.
     */
    export type FeaturesAsFlags<N extends ClusterTyping, F extends readonly string[]> = N extends {
        Features: infer All extends string;
    }
        ? { [K in Uncapitalize<All>]: Capitalize<K> extends `${F[number]}` ? true : false }
        : { [K in F[number] as Uncapitalize<K>]: true };

    /**
     * Constraint for `alter()` input based on namespace element keys.
     */
    export type Alterations<N extends ClusterTyping> = {
        attributes?: { [K in AttrKeysOf<N>]?: ClusterModifier.RequirementModification };
        commands?: { [K in CommandKeysOf<N>]?: ClusterModifier.RequirementModification };
        events?: { [K in EventKeysOf<N>]?: ClusterModifier.RequirementModification };
    };

    /**
     * Constraint for `enable()` input based on namespace element keys.
     */
    export type ElementFlags<N extends ClusterTyping> = {
        attributes?: { [K in AttrKeysOf<N>]?: true };
        commands?: { [K in CommandKeysOf<N>]?: true };
        events?: { [K in EventKeysOf<N>]?: true };
    };

    /**
     * Install lazy getters on a cluster namespace object.  Each property is computed on first access via
     * {@link Object.defineProperty}, then replaced with the computed value.
     */
    export function define(ns: object, inputModel?: ClusterModel): void {
        const model = inputModel ?? (ns as { schema?: ClusterModel }).schema;
        if (!model) {
            return;
        }

        if (!Object.hasOwn(ns, "schema")) {
            Object.defineProperty(ns, "schema", { value: model, enumerable: true, configurable: true });
        }

        const lazy = (name: string, factory: () => unknown) => {
            Object.defineProperty(ns, name, {
                get() {
                    const value = factory();
                    Object.defineProperty(ns, name, { value, enumerable: true, configurable: true });
                    return value;
                },
                enumerable: true,
                configurable: true,
            });
        };

        lazy("attributes", () => attributes(model));
        lazy("commands", () => commands(model));
        lazy("events", () => events(model));
        lazy("features", () => features(model));
    }

    /**
     * Create a typed map of cluster attributes from a {@link ClusterModel}.
     */
    export function attributes(model: ClusterModel) {
        const result: Record<string, Attribute> = {};
        for (const attribute of model.attributes) {
            if (GLOBAL_IDS.has(attribute.id) || attribute.isDisallowed || attribute.effectiveMetatype === undefined) {
                continue;
            }
            const key = attribute.propertyName;
            result[key] = {
                id: attribute.id as AttributeId,
                name: key,
                schema: attribute,
            };
        }
        return result;
    }

    /**
     * Create a typed map of cluster commands from a {@link ClusterModel}.
     */
    export function commands(model: ClusterModel) {
        const result: Record<string, Command> = {};
        for (const command of model.commands) {
            if (!command.isRequest || command.isDisallowed) {
                continue;
            }
            const key = command.propertyName;
            result[key] = {
                id: command.id as CommandId,
                name: key,
                schema: command,
            };
        }
        return result;
    }

    /**
     * Create a typed map of cluster events from a {@link ClusterModel}.
     */
    export function events(model: ClusterModel) {
        const result: Record<string, Event> = {};
        for (const event of model.events) {
            if (event.isDisallowed) {
                continue;
            }
            const key = event.propertyName;
            result[key] = {
                id: event.id as EventId,
                name: key,
                schema: event,
            };
        }
        return result;
    }

    /**
     * Create a typed map of cluster features from a {@link ClusterModel}.
     */
    export function features(model: ClusterModel) {
        const result: Record<string, { id: number; name: string }> = {};
        for (const feature of model.features) {
            const key = camelize(feature.title ?? feature.name);
            if (typeof feature.constraint.value === "number") {
                result[key] = {
                    id: feature.constraint.value,
                    name: key,
                };
            }
        }
        return result;
    }
}

/**
 * Describes the shape of types matter.js uses for compile-time generation of Matter cluster-related APIs.
 *
 * This does not represent an actual object.  It only exists to convey type information that is input to matter.js's
 * type system.  For standard clusters this information has no other compile-time representation as matter.js generates
 * related classes at runtime.
 */
export interface ClusterTyping {
    Attributes?: {};
    Commands?: {};
    Events?: {};
    Features?: {};
    Components?: {};
    SupportedFeatures?: {};
    readonly schema?: ClusterModel;
}
