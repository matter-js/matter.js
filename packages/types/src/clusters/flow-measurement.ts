/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { FlowMeasurement as FlowMeasurementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the FlowMeasurement cluster.
 */
export namespace FlowMeasurement {
    /**
     * {@link FlowMeasurement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the flow in m^3/h as follows:
             *
             * MeasuredValue = 10 x Flow
             *
             * The null value indicates that the flow measurement is unknown, otherwise the range shall be as described
             * in Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.1
             */
            readonly measuredValue: number | null;

            /**
             * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.2
             */
            readonly minMeasuredValue: number | null;

            /**
             * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.3
             */
            readonly maxMeasuredValue: number | null;

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.4
             */
            readonly tolerance?: number;
        }
    }

    /**
     * Attributes that may appear in {@link FlowMeasurement}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * Indicates the flow in m^3/h as follows:
         *
         * MeasuredValue = 10 x Flow
         *
         * The null value indicates that the flow measurement is unknown, otherwise the range shall be as described in
         * Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.1
         */
        readonly measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.2
         */
        readonly minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.3
         */
        readonly maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.4
         */
        readonly tolerance: number;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id = ClusterId(0x404);
    export const name = "FlowMeasurement" as const;
    export const revision = 3;
    export const schema = FlowMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof FlowMeasurement;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `FlowMeasurement` instead of `FlowMeasurement.Complete`)
     */
    export type Complete = typeof FlowMeasurement;

    export declare const Complete: Complete;
    export declare const Typing: FlowMeasurement;
}

ClusterNamespace.define(FlowMeasurement);
export type FlowMeasurementCluster = FlowMeasurement.Cluster;
export const FlowMeasurementCluster = FlowMeasurement.Cluster;
export interface FlowMeasurement extends ClusterTyping { Attributes: FlowMeasurement.Attributes; Components: FlowMeasurement.Components }
