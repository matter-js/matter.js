/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ResourceMonitoring } from "./resource-monitoring.js";
import type { MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ActivatedCarbonFilterMonitoring as ActivatedCarbonFilterMonitoringModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ActivatedCarbonFilterMonitoring cluster.
 */
export declare namespace ActivatedCarbonFilterMonitoring {
    /**
     * {@link ActivatedCarbonFilterMonitoring} always supports these elements.
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
     * {@link ActivatedCarbonFilterMonitoring} supports these elements if it supports feature "Condition".
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
     * {@link ActivatedCarbonFilterMonitoring} supports these elements if it supports feature "ReplacementProductList".
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

    export interface Attributes extends Base.Attributes, Partial<ConditionComponent.Attributes>, Partial<ReplacementProductListComponent.Attributes> {}
    export interface Commands extends Base.Commands {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        { flags: { condition: true }, attributes: ConditionComponent.Attributes },
        { flags: { replacementProductList: true }, attributes: ReplacementProductListComponent.Attributes }
    ];
    export type Features = "Condition" | "Warning" | "ReplacementProductList";

    /**
     * These are optional features supported by ActivatedCarbonFilterMonitoringCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.8.4
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

    export const id: ClusterId;
    export const name: "ActivatedCarbonFilterMonitoring";
    export const revision: 1;
    export const schema: typeof ActivatedCarbonFilterMonitoringModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof ActivatedCarbonFilterMonitoring;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ActivatedCarbonFilterMonitoring` instead of
     * `ActivatedCarbonFilterMonitoring.Complete`)
     */
    export const Complete: typeof ActivatedCarbonFilterMonitoring;

    export const Typing: ActivatedCarbonFilterMonitoring;
}

export declare const ActivatedCarbonFilterMonitoringCluster: typeof ActivatedCarbonFilterMonitoring;
export interface ActivatedCarbonFilterMonitoring extends ClusterTyping { Attributes: ActivatedCarbonFilterMonitoring.Attributes; Commands: ActivatedCarbonFilterMonitoring.Commands; Features: ActivatedCarbonFilterMonitoring.Features; Components: ActivatedCarbonFilterMonitoring.Components }
