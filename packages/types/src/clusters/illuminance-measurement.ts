/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { IlluminanceMeasurement as IlluminanceMeasurementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the IlluminanceMeasurement cluster.
 */
export namespace IlluminanceMeasurement {
    /**
     * {@link IlluminanceMeasurement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the illuminance in Lux (symbol lx) as follows:
             *
             *   - MeasuredValue = 10,000 x log10(illuminance) + 1,
             *
             * where 1 lx <= illuminance <= 3.576 Mlx, corresponding to a MeasuredValue in the range 1 to 0xFFFE.
             *
             * The MeasuredValue attribute can take the following values:
             *
             *   - 0 indicates a value of illuminance that is too low to be measured,
             *
             *   - MinMeasuredValue <= MeasuredValue <= MaxMeasuredValue under normal circumstances,
             *
             *   - null indicates that the illuminance measurement is invalid.
             *
             * The MeasuredValue attribute is updated continuously as new measurements are made.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.1
             */
            readonly measuredValue: number | null;

            /**
             * Indicates the minimum value of MeasuredValue that can be measured. A value of null indicates that this
             * attribute is not defined. See Measured Value for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.2
             */
            readonly minMeasuredValue: number | null;

            /**
             * Indicates the maximum value of MeasuredValue that can be measured. A value of null indicates that this
             * attribute is not defined. See Measured Value for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.3
             */
            readonly maxMeasuredValue: number | null;

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.4
             */
            readonly tolerance?: number;

            /**
             * Indicates the electronic type of the light sensor. This attribute shall be set to one of the non-reserved
             * values listed in LightSensorTypeEnum or null in case the sensor type is unknown.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.5
             */
            readonly lightSensorType?: number | null;
        }
    }

    /**
     * Attributes that may appear in {@link IlluminanceMeasurement}.
     *
     * Optional properties represent attributes that devices are not required to support.
     */
    export interface Attributes {
        /**
         * Indicates the illuminance in Lux (symbol lx) as follows:
         *
         *   - MeasuredValue = 10,000 x log10(illuminance) + 1,
         *
         * where 1 lx <= illuminance <= 3.576 Mlx, corresponding to a MeasuredValue in the range 1 to 0xFFFE.
         *
         * The MeasuredValue attribute can take the following values:
         *
         *   - 0 indicates a value of illuminance that is too low to be measured,
         *
         *   - MinMeasuredValue <= MeasuredValue <= MaxMeasuredValue under normal circumstances,
         *
         *   - null indicates that the illuminance measurement is invalid.
         *
         * The MeasuredValue attribute is updated continuously as new measurements are made.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.1
         */
        readonly measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. A value of null indicates that this
         * attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.2
         */
        readonly minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. A value of null indicates that this
         * attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.3
         */
        readonly maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.4
         */
        readonly tolerance: number;

        /**
         * Indicates the electronic type of the light sensor. This attribute shall be set to one of the non-reserved
         * values listed in LightSensorTypeEnum or null in case the sensor type is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.2.5.5
         */
        readonly lightSensorType: number | null;
    }

    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.2.4.1
     */
    export enum LightSensorType {
        /**
         * Indicates photodiode sensor type
         */
        Photodiode = 0,

        /**
         * Indicates CMOS sensor type
         */
        Cmos = 1
    }

    export const id = ClusterId(0x400);
    export const name = "IlluminanceMeasurement" as const;
    export const revision = 3;
    export const schema = IlluminanceMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export type Cluster = typeof IlluminanceMeasurement;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `IlluminanceMeasurement` instead of
     * `IlluminanceMeasurement.Complete`)
     */
    export type Complete = typeof IlluminanceMeasurement;

    export declare const Complete: Complete;
    export declare const Typing: IlluminanceMeasurement;
}

ClusterNamespace.define(IlluminanceMeasurement);
export type IlluminanceMeasurementCluster = IlluminanceMeasurement.Cluster;
export const IlluminanceMeasurementCluster = IlluminanceMeasurement.Cluster;
export interface IlluminanceMeasurement extends ClusterTyping { Attributes: IlluminanceMeasurement.Attributes; Components: IlluminanceMeasurement.Components }
