/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { ResourceMonitoring } from "./resource-monitoring.js";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the ActivatedCarbonFilterMonitoring cluster.
 */
export declare namespace ActivatedCarbonFilterMonitoring {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0072;

    /**
     * Textual cluster identifier.
     */
    export const name: "ActivatedCarbonFilterMonitoring";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ActivatedCarbonFilterMonitoring cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ActivatedCarbonFilterMonitoring} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the current
         * requirement to change the resource.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.3
         */
        changeIndication: ResourceMonitoring.ChangeIndication;

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
     * {@link ActivatedCarbonFilterMonitoring} supports these elements if it supports feature "Condition".
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
        degradationDirection: ResourceMonitoring.DegradationDirection;
    }

    /**
     * {@link ActivatedCarbonFilterMonitoring} supports these elements if it supports feature "ReplacementProductList".
     */
    export interface ReplacementProductListAttributes {
        /**
         * Indicates the list of supported products that may be used as replacements for the current resource. Each item
         * in this list represents a unique ReplacementProductStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.6
         */
        replacementProductList: ResourceMonitoring.ReplacementProduct[];
    }

    /**
     * Attributes that may appear in {@link ActivatedCarbonFilterMonitoring}.
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
        changeIndication: ResourceMonitoring.ChangeIndication;

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
        degradationDirection: ResourceMonitoring.DegradationDirection;

        /**
         * Indicates the list of supported products that may be used as replacements for the current resource. Each item
         * in this list represents a unique ReplacementProductStruct.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.8.6.6
         */
        replacementProductList: ResourceMonitoring.ReplacementProduct[];
    }

    /**
     * {@link ActivatedCarbonFilterMonitoring} always supports these elements.
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
     * Commands that may appear in {@link ActivatedCarbonFilterMonitoring}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { condition: true }, attributes: ConditionAttributes },
        { flags: { replacementProductList: true }, attributes: ReplacementProductListAttributes }
    ];
    export type Features = "Condition" | "Warning" | "ReplacementProductList";

    /**
     * These are optional features supported by ActivatedCarbonFilterMonitoringCluster.
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
     * @deprecated Use {@link ActivatedCarbonFilterMonitoring}.
     */
    export const Cluster: ClusterType.WithCompat<typeof ActivatedCarbonFilterMonitoring, ActivatedCarbonFilterMonitoring>;

    /**
     * @deprecated Use {@link ActivatedCarbonFilterMonitoring}.
     */
    export const Complete: typeof ActivatedCarbonFilterMonitoring;

    export const Typing: ActivatedCarbonFilterMonitoring;
}

/**
 * @deprecated Use {@link ActivatedCarbonFilterMonitoring}.
 */
export declare const ActivatedCarbonFilterMonitoringCluster: typeof ActivatedCarbonFilterMonitoring;

export interface ActivatedCarbonFilterMonitoring extends ClusterTyping {
    Attributes: ActivatedCarbonFilterMonitoring.Attributes;
    Commands: ActivatedCarbonFilterMonitoring.Commands;
    Features: ActivatedCarbonFilterMonitoring.Features;
    Components: ActivatedCarbonFilterMonitoring.Components;
}
