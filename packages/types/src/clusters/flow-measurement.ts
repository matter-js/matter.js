/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Identity } from "@matter/general";
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

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x404,
        name: "FlowMeasurement",
        revision: 3,

        attributes: {
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
            measuredValue: Attribute(0x0, TlvNullable(TlvUInt16)),

            /**
             * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.2
             */
            minMeasuredValue: Attribute(0x1, TlvNullable(TlvUInt16.bound({ max: 65533 }))),

            /**
             * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.3
             */
            maxMeasuredValue: Attribute(0x2, TlvNullable(TlvUInt16)),

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.4
             */
            tolerance: OptionalAttribute(0x3, TlvUInt16.bound({ max: 2048 }), { default: 0 })
        }
    });

    /**
     * This cluster provides an interface to flow measurement functionality, including configuration and provision of
     * notifications of flow measurements.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.5
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `FlowMeasurement` instead of `FlowMeasurement.Complete`)
     */
    export type Complete = typeof FlowMeasurement;

    export declare const Complete: Complete;
    export const id = ClusterId(0x404);
    export const name = "FlowMeasurement" as const;
    export const revision = 3;
    export const schema = FlowMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const Typing: FlowMeasurement;
}

export type FlowMeasurementCluster = FlowMeasurement.Cluster;
export const FlowMeasurementCluster = FlowMeasurement.Cluster;
ClusterNamespace.define(FlowMeasurement);
export interface FlowMeasurement extends ClusterTyping { Attributes: FlowMeasurement.Attributes; Components: FlowMeasurement.Components }
