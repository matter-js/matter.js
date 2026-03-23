/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { IlluminanceMeasurement as IlluminanceMeasurementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the IlluminanceMeasurement cluster.
 */
export declare namespace IlluminanceMeasurement {
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

    export interface Attributes extends Base.Attributes {}
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

    export const id: ClusterId;
    export const name: "IlluminanceMeasurement";
    export const revision: 3;
    export const schema: typeof IlluminanceMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof IlluminanceMeasurement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `IlluminanceMeasurement` instead of
     * `IlluminanceMeasurement.Complete`)
     */
    export const Complete: typeof IlluminanceMeasurement;

    export const Typing: IlluminanceMeasurement;
}

export declare const IlluminanceMeasurementCluster: typeof IlluminanceMeasurement;
export interface IlluminanceMeasurement extends ClusterTyping { Attributes: IlluminanceMeasurement.Attributes; Components: IlluminanceMeasurement.Components }
