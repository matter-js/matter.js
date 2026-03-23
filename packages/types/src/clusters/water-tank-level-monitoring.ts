/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { ResourceMonitoring } from "./resource-monitoring.js";
import { Identity, MaybePromise } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { WaterTankLevelMonitoring as WaterTankLevelMonitoringModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the WaterTankLevelMonitoring cluster.
 */
export namespace WaterTankLevelMonitoring {
    /**
     * Attributes that may appear in {@link WaterTankLevelMonitoring}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the current
         * requirement to change the resource.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.3
         */
        changeIndication: ResourceMonitoring.ChangeIndication;

        /**
         * Indicates whether a resource is currently installed. A value of true shall indicate that a resource is
         * installed. A value of false shall indicate that a resource is not installed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.4
         */
        inPlaceIndicator: boolean;

        /**
         * This attribute may indicates the time at which the resource has been changed, if supported by the server. The
         * attribute shall be null if it was never set or is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.5
         */
        lastChangedTime: number | null;

        /**
         * Indicates the current condition of the resource in percent.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.1
         */
        condition: number;

        /**
         * Indicates the direction of change for the condition of the resource over time, which helps to determine
         * whether a higher or lower condition value is considered optimal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.2
         */
        degradationDirection: ResourceMonitoring.DegradationDirection;

        /**
         * Indicates the list of supported products that may be used as replacements for the current resource. Each item
         * in this list represents a unique ReplacementProductStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.6
         */
        replacementProductList: ResourceMonitoring.ReplacementProduct[];
    }

    export namespace Attributes {
        export type Components = [
            { flags: {}, mandatory: "changeIndication", optional: "inPlaceIndicator" | "lastChangedTime" },
            { flags: { condition: true }, mandatory: "condition" | "degradationDirection" },
            { flags: { replacementProductList: true }, mandatory: "replacementProductList" }
        ];
    }

    export interface Commands extends Commands.Base {}

    export namespace Commands {
        /**
         * {@link WaterTankLevelMonitoring} always supports these commands.
         */
        export interface Base {
            /**
             * Upon receipt, the device shall reset the Condition and ChangeIndicator attributes, indicating full
             * resource availability and readiness for use, as initially configured. Invocation of this command may
             * cause the LastChangedTime to be updated automatically based on the clock of the server, if the server
             * supports setting the attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.7.1
             */
            resetCondition(): MaybePromise;
        }

        export type Components = [{ flags: {}, methods: Base }];
    }

    export type Features = "Condition" | "Warning" | "ReplacementProductList";

    export const Base = { ...ResourceMonitoring.Base, id: 0x79, name: "WaterTankLevelMonitoring" } as const;

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This alias specializes the semantics of {@link ResourceMonitoring.Base}.
     *
     * WaterTankLevelMonitoringCluster supports optional features that you can enable with the
     * WaterTankLevelMonitoringCluster.with() factory method.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * This cluster supports all WaterTankLevelMonitoring features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export const CompleteInstance = MutableCluster({
        ...ResourceMonitoring.Complete,
        id: 0x79,
        name: "WaterTankLevelMonitoring"
    });

    export interface Complete extends Identity<typeof CompleteInstance> {}
    export const Complete: Complete = CompleteInstance;
    export const id = ClusterId(0x79);
    export const name = "WaterTankLevelMonitoring" as const;
    export const revision = 1;
    export const schema = WaterTankLevelMonitoringModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: WaterTankLevelMonitoring;
}

export type WaterTankLevelMonitoringCluster = WaterTankLevelMonitoring.Cluster;
export const WaterTankLevelMonitoringCluster = WaterTankLevelMonitoring.Cluster;
ClusterRegistry.register(WaterTankLevelMonitoring.Complete);
ClusterNamespace.define(WaterTankLevelMonitoring);
export interface WaterTankLevelMonitoring extends ClusterTyping { Attributes: WaterTankLevelMonitoring.Attributes & { Components: WaterTankLevelMonitoring.Attributes.Components }; Commands: WaterTankLevelMonitoring.Commands & { Components: WaterTankLevelMonitoring.Commands.Components }; Features: WaterTankLevelMonitoring.Features }
