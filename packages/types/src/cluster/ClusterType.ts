/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterId } from "../datatype/ClusterId.js";
import { BitSchema, TypeFromPartialBitSchema } from "../schema/BitmapSchema.js";
import { GlobalAttributes } from "./Cluster.js";
import { ClusterNamespace } from "./ClusterNamespace.js";
import { RetiredClusterType } from "./RetiredClusterType.js";
import type {
    Attribute as ClusterAttribute,
    Command as ClusterCommand,
    Event as ClusterEvent,
} from "./RetiredElements.js";

/**
 * A "cluster" is a grouping of related functionality that a Matter endpoint supports.
 *
 * ClusterType describes the functionality of a specific type of cluster.
 */
export interface ClusterType extends ClusterType.Identity, ClusterType.Features<BitSchema>, ClusterType.Elements {}

/**
 * Define a cluster.
 *
 * @deprecated use {@link ClusterNamespace} instead.
 */
export function ClusterType<const T extends RetiredClusterType.Options>(options: T): ClusterType.FromOptions<T> {
    return ClusterNamespace(RetiredClusterType.ModelForOptions(options)) as ClusterType.FromOptions<T>;
}

export namespace ClusterType {
    /**
     * The result of calling `ClusterType(options)`.
     *
     * At runtime this is a `ClusterNamespace.Concrete` object. The `Typing` field carries value types derived from
     * the TLV schemas in the options bag.
     */
    export type FromOptions<T extends RetiredClusterType.Options> = ClusterNamespace.Concrete & {
        Typing: RetiredClusterType.TypingOfOptions<T>;
    };

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
        readonly extensions?: readonly RetiredClusterType.Extension<F>[];

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
     * @deprecated Use {@link RetiredClusterType.Of}.
     */
    export type Of<T extends RetiredClusterType.Options> = RetiredClusterType.Of<T>;

    /**
     * @deprecated Use {@link RetiredClusterType.Options}.
     */
    export type Options<F extends BitSchema = {}> = RetiredClusterType.Options<F>;

    /**
     * @deprecated Use {@link RetiredClusterType.AttributeValues}.
     */
    export type AttributeValues<T> = RetiredClusterType.AttributeValues<T>;

    /**
     * @deprecated Use {@link RetiredClusterType.ValuesOfAttributes}.
     */
    export type ValuesOfAttributes<AttrsT extends { [K: string]: Attribute }> =
        RetiredClusterType.ValuesOfAttributes<AttrsT>;

    /**
     * @deprecated Use {@link RetiredClusterType.PatchType}.
     */
    export type PatchType<V> = RetiredClusterType.PatchType<V>;

    /**
     * @deprecated Use {@link RetiredClusterType.Extension}.
     */
    export type Extension<F extends BitSchema = {}> = RetiredClusterType.Extension<F>;

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
