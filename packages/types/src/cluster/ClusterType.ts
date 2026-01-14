/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, Merge } from "#general";
import { ClusterId } from "../datatype/ClusterId.js";
import { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { TlvSchema } from "../tlv/TlvSchema.js";

// ClusterType is duplicative of Cluster.  At some point we may migrate away from Cluster entirely but until we do we
// use Cluster definitions where feasible to ease compatibility
import {
    Attribute as ClusterAttribute,
    Command as ClusterCommand,
    Event as ClusterEvent,
    GlobalAttributes,
} from "./Cluster.js";

/**
 * A "cluster" is a grouping of related functionality that a Matter endpoint supports.
 *
 * ClusterType describes the functionality of a specific type of cluster.
 */
export interface ClusterType extends ClusterType.Identity, ClusterType.Features<BitSchema>, ClusterType.Elements {}

/**
 * Define a cluster.
 */
export function ClusterType<const T extends ClusterType.Options>(options: T) {
    const cluster = {
        id: ClusterId(options.id),
        name: options.name,
        revision: options.revision,

        features: options.features ?? {},
        supportedFeatures: options.supportedFeatures ?? {},

        attributes: {
            ...options.attributes,
            ...GlobalAttributes(options.features ?? {}),
        },
        commands: options.commands ?? {},
        events: options.events ?? {},

        unknown: false,
    } as ClusterType.Of<T>;

    if (options.base) {
        cluster.base = options.base as ClusterType.Of<T>["base"];
    }

    if (options.extensions) {
        cluster.extensions = options.extensions as ClusterType.Of<T>["extensions"];
    }

    return cluster;
}

export namespace ClusterType {
    /**
     * Definition of a cluster attribute.
     */
    export type Attribute = ClusterAttribute<any, any>;

    /**
     * Definition of a cluster command.
     */
    export type Command = ClusterCommand<any, any, any>;

    /**
     * Definition of a cluster event.
     */
    export type Event = ClusterEvent<any, any>;

    /**
     * A fully typed {@link ClusterType} for an {@link Options} type.
     */
    export interface Of<T extends Options> {
        id: Branded<T["id"], "ClusterId">;
        name: T["name"];
        revision: T["revision"];
        features: T["features"] extends {} ? T["features"] : {};
        supportedFeatures: T["supportedFeatures"] extends {} ? T["supportedFeatures"] : {};
        attributes: T["attributes"] extends infer A extends {}
            ? Merge<A, GlobalAttributes<T["features"] extends {} ? T["features"] : {}>>
            : {};
        commands: T["commands"] extends {} ? T["commands"] : {};
        events: T["events"] extends {} ? T["events"] : {};
        unknown: T["unknown"] extends boolean ? T["unknown"] : false;
        base: T["base"] extends {} ? T["base"] : undefined;
        extensions: T["extensions"] extends {} ? T["extensions"] : undefined;
    }

    /**
     * Input to {@link ClusterType} function.  This is a relaxed extension of
     * {@link ClusterType} with empty objects optional.
     */
    export type Options<F extends BitSchema = {}> = { id: number } & Omit<ClusterType.Identity, "id"> &
        Partial<ClusterType.Features<F>> & {
            attributes?: ClusterType.ElementSet<ClusterType.Attribute>;
            commands?: ClusterType.ElementSet<ClusterType.Command>;
            events?: ClusterType.ElementSet<ClusterType.Event>;
        };

    /**
     * Fields that uniquely identify a cluster.
     */
    export interface Identity {
        readonly id: ClusterId;
        readonly name: string;
        readonly revision: number;
    }

    /**
     * An "element set" defines the set of elements (commands, attributes or events) of a cluster.
     */
    export type ElementSet<T> = Record<string, T>;

    /**
     * Cluster "elements" are attributes, commands and events that may comprise a cluster.
     */
    export interface Elements {
        /**
         * Attributes supported by the cluster.
         */
        readonly attributes: ElementSet<Attribute>;

        /**
         * Commands supported by the cluster.
         */
        readonly commands: ElementSet<Command>;

        /**
         * Events supported by the cluster.
         */
        readonly events: ElementSet<Event>;
    }

    /**
     * Cluster "features" describe the features supported by a cluster.
     */
    export interface Features<F extends BitSchema = {}> {
        /**
         * Features the cluster may support.
         */
        readonly features: F;

        /**
         * Features the cluster does support.
         */
        readonly supportedFeatures: TypeFromPartialBitSchema<F>;

        /**
         * Metadata controlling how enabled features affect cluster structure.
         */
        readonly extensions?: readonly Extension<F>[];

        /**
         * If you enable features, this property tracks the shape of the cluster with no features enabled.
         */
        readonly base?: ClusterType;

        /**
         * If true, this flag indicates that the cluster is not known to matter.js.  This implies a cluster ID for which
         * we do not have a cluster definition.
         *
         * Some functionality is available for unknown clusters but an official Matter definition is generally required
         * for full functionality.
         */
        readonly unknown: boolean;
    }

    /**
     * Extract the type of a cluster's attributes (excluding global attributes).
     */
    export type AttributesOf<C> = C extends { attributes: infer E extends { [K in string]: ClusterType.Attribute } }
        ? {
              -readonly [K in keyof E as string extends K
                  ? never
                  : K extends keyof GlobalAttributes<any>
                    ? never
                    : K]: C["attributes"][K];
          }
        : EmptyElementSet<Attribute>;

    /**
     * Extract the type of a cluster's commands.
     */
    export type CommandsOf<C> = C extends { commands: infer E extends { [K in string]: ClusterType.Command } }
        ? {
              -readonly [K in keyof E as string extends K ? never : K]: E[K];
          }
        : EmptyElementSet<Command>;

    /**
     * Extract the type of a cluster's events.
     */
    export type EventsOf<C> = C extends { events: infer E extends { [K in string]: ClusterType.Event } }
        ? {
              -readonly [K in keyof E as string extends K ? never : K]: E[K];
          }
        : EmptyElementSet<Event>;

    /**
     * This bit of hackery describes a set that has no elements but for which typescript thinks it knows the type if you
     * index generically by string.
     */
    export type EmptyElementSet<T> = Record<string, never> & Record<string, T>;

    /**
     * The collective object type of the cluster's attributes.
     */
    export type AttributeValues<T> = ValuesOfAttributes<ClusterType.AttributesOf<T>>;

    export type ValuesOfAttributes<AttrsT extends { [K: string]: Attribute }> = {
        [K in keyof AttrsT as [AttrsT[K]] extends [{ optional: true }] ? never : K]: AttrsT[K] extends {
            schema: TlvSchema<infer T>;
        }
            ? T
            : never;
    } & {
        [K in keyof AttrsT as [AttrsT[K]] extends [{ optional: true }] ? K : never]?: AttrsT[K] extends {
            schema: TlvSchema<infer T>;
        }
            ? T
            : never;
    };

    export type PatchType<V> = V extends (infer E)[]
        ? { readonly [K in `${number}`]: PatchType<E> } | Readonly<PatchType<E>[]>
        : V extends boolean | number | bigint | string
          ? V
          : V extends object
            ? V extends (...args: any[]) => any
                ? never
                : {
                      readonly [K in keyof V]?: PatchType<V[K]>;
                  }
            : V;

    /**
     * Matter clusters support named "features" that enable sets of optional functionality.
     *
     * There is not a 1:1 mapping between features and cluster elements.  Some elements are enabled only when specific
     * features are enabled or disabled in combination.
     *
     * Further, some features are mutually exclusive and thus do not generate a valid cluster when used in combination.
     *
     * This type describes a feature combination and how it alters a cluster. ClusterComposer uses this metadata to
     * generate clusters based on selected features.
     */
    export interface Extension<F extends BitSchema = {}> {
        /**
         * Flags indicating the features for which this extension applies.
         *
         * For each feature the flag is a tri-state component:
         *
         *   - true = feature is required to enable extension
         *
         *   - false = extension cannot be enabled if feature is enabled
         *
         *   - undefined = feature is not irrelevant for the extension
         */
        flags: TypeFromPartialBitSchema<F>;

        /**
         * The elements to inject if the flags match active features.  If the component is "false" the cluster cannot be
         * instantiated with the feature combination.
         */
        component: false | Partial<Elements>;
    }

    /**
     * A placeholder cluster.
     */
    export const Unknown = ClusterType({
        id: 0,
        revision: 0,
        name: "Unknown",

        attributes: {},
        commands: {},
        events: {},
    });
    export type Unknown = typeof Unknown;
}
