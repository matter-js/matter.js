/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { ResourceMonitoring } from "./resource-monitoring.js";
import { Identity, MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { HepaFilterMonitoring as HepaFilterMonitoringModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the HepaFilterMonitoring cluster.
 */
export namespace HepaFilterMonitoring {
    /**
     * {@link HepaFilterMonitoring} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the
             * current requirement to change the resource.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.3
             */
            readonly changeIndication: ResourceMonitoring.ChangeIndication;

            /**
             * Indicates whether a resource is currently installed. A value of true shall indicate that a resource is
             * installed. A value of false shall indicate that a resource is not installed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.4
             */
            readonly inPlaceIndicator?: boolean;

            /**
             * This attribute may indicates the time at which the resource has been changed, if supported by the server.
             * The attribute shall be null if it was never set or is unknown.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.5
             */
            lastChangedTime?: number | null;
        }

        export interface Commands {
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
    }

    /**
     * {@link HepaFilterMonitoring} supports these elements if it supports feature "Condition".
     */
    export namespace ConditionComponent {
        export interface Attributes {
            /**
             * Indicates the current condition of the resource in percent.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.1
             */
            readonly condition: number;

            /**
             * Indicates the direction of change for the condition of the resource over time, which helps to determine
             * whether a higher or lower condition value is considered optimal.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.2
             */
            readonly degradationDirection: ResourceMonitoring.DegradationDirection;
        }
    }

    /**
     * {@link HepaFilterMonitoring} supports these elements if it supports feature "ReplacementProductList".
     */
    export namespace ReplacementProductListComponent {
        export interface Attributes {
            /**
             * Indicates the list of supported products that may be used as replacements for the current resource. Each
             * item in this list represents a unique ReplacementProductStruct.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.6
             */
            readonly replacementProductList: ResourceMonitoring.ReplacementProduct[];
        }
    }

    /**
     * Attributes that may appear in {@link HepaFilterMonitoring}.
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
        readonly changeIndication: ResourceMonitoring.ChangeIndication;

        /**
         * Indicates whether a resource is currently installed. A value of true shall indicate that a resource is
         * installed. A value of false shall indicate that a resource is not installed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.4
         */
        readonly inPlaceIndicator: boolean;

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
        readonly condition: number;

        /**
         * Indicates the direction of change for the condition of the resource over time, which helps to determine
         * whether a higher or lower condition value is considered optimal.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.2
         */
        readonly degradationDirection: ResourceMonitoring.DegradationDirection;

        /**
         * Indicates the list of supported products that may be used as replacements for the current resource. Each item
         * in this list represents a unique ReplacementProductStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.8.6.6
         */
        readonly replacementProductList: ResourceMonitoring.ReplacementProduct[];
    }

    export interface Commands extends Base.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { condition: true }, attributes: ConditionComponent.Attributes },
        { flags: { replacementProductList: true }, attributes: ReplacementProductListComponent.Attributes }
    ];
    export type Features = "Condition" | "Warning" | "ReplacementProductList";

    export const Base = { ...ResourceMonitoring.Base, id: 0x71, name: "HepaFilterMonitoring" } as const;

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This alias specializes the semantics of {@link ResourceMonitoring.Base}.
     *
     * HepaFilterMonitoringCluster supports optional features that you can enable with the
     * HepaFilterMonitoringCluster.with() factory method.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * This cluster supports all HepaFilterMonitoring features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export const CompleteInstance = MutableCluster({
        ...ResourceMonitoring.Complete,
        id: 0x71,
        name: "HepaFilterMonitoring"
    });

    export interface Complete extends Identity<typeof CompleteInstance> {}
    export const Complete: Complete = CompleteInstance;
    export const id = ClusterId(0x71);
    export const name = "HepaFilterMonitoring" as const;
    export const revision = 1;
    export const schema = HepaFilterMonitoringModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: HepaFilterMonitoring;
}

export type HepaFilterMonitoringCluster = HepaFilterMonitoring.Cluster;
export const HepaFilterMonitoringCluster = HepaFilterMonitoring.Cluster;
ClusterNamespace.define(HepaFilterMonitoring);
export interface HepaFilterMonitoring extends ClusterTyping { Attributes: HepaFilterMonitoring.Attributes; Commands: HepaFilterMonitoring.Commands; Features: HepaFilterMonitoring.Features; Components: HepaFilterMonitoring.Components }
