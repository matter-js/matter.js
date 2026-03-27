/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MeasurementAccuracy } from "../globals/MeasurementAccuracy.js";

/**
 * Definitions for the SoilMeasurement cluster.
 *
 * This cluster provides an interface to soil measurement functionality, including configuration and provision of
 * notifications of soil measurements.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.15
 */
export declare namespace SoilMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0430;

    /**
     * Textual cluster identifier.
     */
    export const name: "SoilMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the SoilMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link SoilMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the limits for the SoilMoistureMeasuredValue attribute.
         *
         * Given the measurements are in percentage, the MinMeasuredValue field in the SoilMoistureMeasurementLimits
         * attribute shall NOT be less than 0 and shall NOT be greater than 99. The MaxMeasuredValue field in the
         * SoilMoistureMeasurementLimits attribute shall NOT be less than (SoilMoistureMinMeasurableValue + 1) and shall
         * NOT be greater than 100. The MeasurementType field value shall be set to SoilMoisture.
         *
         * There shall only be a single entry in the AccuracyRanges list of the SoilMoistureMeasurementLimits attribute.
         * The entry shall cover the full measurement range, meaning that the value of the RangeMin field shall be equal
         * to the value of the MinMeasuredValue field and the value of the RangeMax field shall be equal to the value of
         * the MaxMeasuredValue field. The entry shall only indicate a PercentMax value and the value shall NOT be
         * greater than 10.00 percent.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.15.4.1
         */
        soilMoistureMeasurementLimits: MeasurementAccuracy;

        /**
         * Indicates the water content of the soil in percentage.
         *
         * The null value indicates that the measurement is unknown e.g. no measurement has been performed yet.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.15.4.2
         */
        soilMoistureMeasuredValue: number | null;
    }

    /**
     * Attributes that may appear in {@link SoilMeasurement}.
     */
    export interface Attributes {
        /**
         * Indicates the limits for the SoilMoistureMeasuredValue attribute.
         *
         * Given the measurements are in percentage, the MinMeasuredValue field in the SoilMoistureMeasurementLimits
         * attribute shall NOT be less than 0 and shall NOT be greater than 99. The MaxMeasuredValue field in the
         * SoilMoistureMeasurementLimits attribute shall NOT be less than (SoilMoistureMinMeasurableValue + 1) and shall
         * NOT be greater than 100. The MeasurementType field value shall be set to SoilMoisture.
         *
         * There shall only be a single entry in the AccuracyRanges list of the SoilMoistureMeasurementLimits attribute.
         * The entry shall cover the full measurement range, meaning that the value of the RangeMin field shall be equal
         * to the value of the MinMeasuredValue field and the value of the RangeMax field shall be equal to the value of
         * the MaxMeasuredValue field. The entry shall only indicate a PercentMax value and the value shall NOT be
         * greater than 10.00 percent.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.15.4.1
         */
        soilMoistureMeasurementLimits: MeasurementAccuracy;

        /**
         * Indicates the water content of the soil in percentage.
         *
         * The null value indicates that the measurement is unknown e.g. no measurement has been performed yet.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.15.4.2
         */
        soilMoistureMeasuredValue: number | null;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link SoilMeasurement}.
     */
    export const Cluster: typeof SoilMeasurement;

    /**
     * @deprecated Use {@link SoilMeasurement}.
     */
    export const Complete: typeof SoilMeasurement;

    export const Typing: SoilMeasurement;
}

/**
 * @deprecated Use {@link SoilMeasurement}.
 */
export declare const SoilMeasurementCluster: typeof SoilMeasurement;

export interface SoilMeasurement extends ClusterTyping {
    Attributes: SoilMeasurement.Attributes;
    Components: SoilMeasurement.Components;
}
