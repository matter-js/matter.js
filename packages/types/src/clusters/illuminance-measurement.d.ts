/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the IlluminanceMeasurement cluster.
 *
 * The Illuminance Measurement cluster provides an interface to illuminance measurement functionality, including
 * configuration and provision of notifications of illuminance measurements.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.2
 */
export declare namespace IlluminanceMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0400;

    /**
     * Textual cluster identifier.
     */
    export const name: "IlluminanceMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the IlluminanceMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link IlluminanceMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. A value of null indicates that this
         * attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. A value of null indicates that this
         * attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.4
         */
        tolerance?: number;

        /**
         * Indicates the electronic type of the light sensor. This attribute shall be set to one of the non-reserved
         * values listed in LightSensorTypeEnum or null in case the sensor type is unknown.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.5
         */
        lightSensorType?: number | null;
    }

    /**
     * Attributes that may appear in {@link IlluminanceMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. A value of null indicates that this
         * attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. A value of null indicates that this
         * attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.4
         */
        tolerance: number;

        /**
         * Indicates the electronic type of the light sensor. This attribute shall be set to one of the non-reserved
         * values listed in LightSensorTypeEnum or null in case the sensor type is unknown.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.2.5.5
         */
        lightSensorType: number | null;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.2.4.1
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

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link IlluminanceMeasurement}.
     */
    export const Cluster: typeof IlluminanceMeasurement;

    /**
     * @deprecated Use {@link IlluminanceMeasurement}.
     */
    export const Complete: typeof IlluminanceMeasurement;

    export const Typing: IlluminanceMeasurement;
}

/**
 * @deprecated Use {@link IlluminanceMeasurement}.
 */
export declare const IlluminanceMeasurementCluster: typeof IlluminanceMeasurement;

export interface IlluminanceMeasurement extends ClusterTyping {
    Attributes: IlluminanceMeasurement.Attributes;
    Components: IlluminanceMeasurement.Components;
}
