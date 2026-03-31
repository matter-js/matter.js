/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the ResourceMonitoring cluster.
 *
 * This generic cluster provides an interface to the current condition of a resource. A resource is a component of a
 * device that is designed to be replaced, refilled, or emptied when exhausted or full. Examples of resources include
 * filters, cartridges, and water tanks. While batteries fit this definition they are not intended to be used with this
 * cluster. Use the power source cluster for batteries instead.
 *
 * > [!NOTE]
 *
 * > This cluster is not meant to be used for monitoring of the system resources, such as processing, memory
 *   utilization, networking properties, etc.
 *
 * This cluster shall be used via an alias to a specific resource type (see Cluster IDs).
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.8
 */
export declare namespace ResourceMonitoring {
    /**
     * Textual cluster identifier.
     */
    export const name: "ResourceMonitoring";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ResourceMonitoring cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ResourceMonitoring} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the current
         * requirement to change the resource.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.3
         */
        changeIndication: ChangeIndication;

        /**
         * Indicates whether a resource is currently installed. A value of true shall indicate that a resource is
         * installed. A value of false shall indicate that a resource is not installed.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.4
         */
        inPlaceIndicator?: boolean;

        /**
         * This attribute may indicates the time at which the resource has been changed, if supported by the server. The
         * attribute shall be null if it was never set or is unknown.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.5
         */
        lastChangedTime?: number | null;
    }

    /**
     * {@link ResourceMonitoring} supports these elements if it supports feature "Condition".
     */
    export interface ConditionAttributes {
        /**
         * Indicates the current condition of the resource in percent.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.1
         */
        condition: number;

        /**
         * Indicates the direction of change for the condition of the resource over time, which helps to determine
         * whether a higher or lower condition value is considered optimal.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.2
         */
        degradationDirection: DegradationDirection;
    }

    /**
     * {@link ResourceMonitoring} supports these elements if it supports feature "ReplacementProductList".
     */
    export interface ReplacementProductListAttributes {
        /**
         * Indicates the list of supported products that may be used as replacements for the current resource. Each item
         * in this list represents a unique ReplacementProductStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.6
         */
        replacementProductList: ReplacementProduct[];
    }

    /**
     * Attributes that may appear in {@link ResourceMonitoring}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the current
         * requirement to change the resource.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.3
         */
        changeIndication: ChangeIndication;

        /**
         * Indicates whether a resource is currently installed. A value of true shall indicate that a resource is
         * installed. A value of false shall indicate that a resource is not installed.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.4
         */
        inPlaceIndicator: boolean;

        /**
         * This attribute may indicates the time at which the resource has been changed, if supported by the server. The
         * attribute shall be null if it was never set or is unknown.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.5
         */
        lastChangedTime: number | null;

        /**
         * Indicates the current condition of the resource in percent.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.1
         */
        condition: number;

        /**
         * Indicates the direction of change for the condition of the resource over time, which helps to determine
         * whether a higher or lower condition value is considered optimal.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.2
         */
        degradationDirection: DegradationDirection;

        /**
         * Indicates the list of supported products that may be used as replacements for the current resource. Each item
         * in this list represents a unique ReplacementProductStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.6
         */
        replacementProductList: ReplacementProduct[];
    }

    /**
     * {@link ResourceMonitoring} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, the device shall reset the Condition and ChangeIndicator attributes, indicating full resource
         * availability and readiness for use, as initially configured. Invocation of this command may cause the
         * LastChangedTime to be updated automatically based on the clock of the server, if the server supports setting
         * the attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.7.1
         */
        resetCondition(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ResourceMonitoring}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { condition: true }, attributes: ConditionAttributes },
        { flags: { replacementProductList: true }, attributes: ReplacementProductListAttributes }
    ];
    export type Features = "Condition" | "Warning" | "ReplacementProductList";

    /**
     * These are optional features supported by ResourceMonitoringCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.8.4
     */
    export enum Feature {
        /**
         * Condition (CON)
         *
         * Supports monitoring the condition of the resource in percentage
         */
        Condition = "Condition",

        /**
         * Warning (WRN)
         *
         * Supports warning indication
         */
        Warning = "Warning",

        /**
         * ReplacementProductList (REP)
         *
         * Supports specifying the list of replacement products
         */
        ReplacementProductList = "ReplacementProductList"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.8.5.2
     */
    export enum ChangeIndication {
        /**
         * Resource is in good condition, no intervention required
         */
        Ok = 0,

        /**
         * Resource will be exhausted soon, intervention will shortly be required
         */
        Warning = 1,

        /**
         * Resource is exhausted, immediate intervention is required
         */
        Critical = 2
    }

    /**
     * Indicates the direction in which the condition of the resource changes over time.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.8.5.1
     */
    export enum DegradationDirection {
        /**
         * The degradation of the resource is indicated by an upwards moving/increasing value
         */
        Up = 0,

        /**
         * The degradation of the resource is indicated by a downwards moving/decreasing value
         */
        Down = 1
    }

    /**
     * Indicates the product identifier that can be used as a replacement for the resource.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.8.5.4
     */
    export declare class ReplacementProduct {
        constructor(values?: Partial<ReplacementProduct>);
        productIdentifierType: ProductIdentifierType;
        productIdentifierValue: string;
    };

    /**
     * Indicate the type of identifier used to describe the product. Devices SHOULD use globally-recognized IDs over OEM
     * specific ones.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.8.5.3
     */
    export enum ProductIdentifierType {
        /**
         * 12-digit Universal Product Code
         */
        Upc = 0,

        /**
         * 8-digit Global Trade Item Number
         */
        Gtin8 = 1,

        /**
         * 13-digit European Article Number
         */
        Ean = 2,

        /**
         * 14-digit Global Trade Item Number
         */
        Gtin14 = 3,

        /**
         * Original Equipment Manufacturer part number
         */
        Oem = 4
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ResourceMonitoring}.
     */
    export const Complete: typeof ResourceMonitoring;

    export const Typing: ResourceMonitoring;
}

export interface ResourceMonitoring extends ClusterTyping {
    Attributes: ResourceMonitoring.Attributes;
    Commands: ResourceMonitoring.Commands;
    Features: ResourceMonitoring.Features;
    Components: ResourceMonitoring.Components;
}
