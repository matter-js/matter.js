/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { TemperatureMeasurement as TemperatureMeasurementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the TemperatureMeasurement cluster.
 */
export namespace TemperatureMeasurement {
    /**
     * {@link TemperatureMeasurement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the measured temperature.
             *
             * The null value indicates that the temperature is unknown.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.1
             */
            readonly measuredValue: number | null;

            /**
             * Indicates the minimum value of MeasuredValue that is capable of being measured. See Measured Value for
             * more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.2
             */
            readonly minMeasuredValue: number | null;

            /**
             * This attribute indicates the maximum value of MeasuredValue that is capable of being measured. See
             * Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.3
             */
            readonly maxMeasuredValue: number | null;

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.4
             */
            readonly tolerance?: number;
        }
    }

    /**
     * Attributes that may appear in {@link TemperatureMeasurement}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * Indicates the measured temperature.
         *
         * The null value indicates that the temperature is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.1
         */
        readonly measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. See Measured Value for more
         * details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.2
         */
        readonly minMeasuredValue: number | null;

        /**
         * This attribute indicates the maximum value of MeasuredValue that is capable of being measured. See Measured
         * Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.3
         */
        readonly maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.4
         */
        readonly tolerance: number;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id = ClusterId(0x402);
    export const name = "TemperatureMeasurement" as const;
    export const revision = 4;
    export const schema = TemperatureMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof TemperatureMeasurement;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `TemperatureMeasurement` instead of
     * `TemperatureMeasurement.Complete`)
     */
    export type Complete = typeof TemperatureMeasurement;

    export declare const Complete: Complete;
    export declare const Typing: TemperatureMeasurement;
}

ClusterNamespace.define(TemperatureMeasurement);
export type TemperatureMeasurementCluster = TemperatureMeasurement.Cluster;
export const TemperatureMeasurementCluster = TemperatureMeasurement.Cluster;
export interface TemperatureMeasurement extends ClusterTyping { Attributes: TemperatureMeasurement.Attributes; Components: TemperatureMeasurement.Components }
