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
 * Definitions for the RelativeHumidityMeasurement cluster.
 *
 * This is a base cluster. The server cluster provides an interface to water content measurement functionality. The
 * measurement is reportable and may be configured for reporting. Water content measurements currently is, but are not
 * limited to relative humidity.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.6
 */
export declare namespace RelativeHumidityMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0405;

    /**
     * Textual cluster identifier.
     */
    export const name: "RelativeHumidityMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the RelativeHumidityMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link RelativeHumidityMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * MeasuredValue represents the water content in % as follows:
         *
         * MeasuredValue = 100 x water content
         *
         * Where 0% < = water content < = 100%, corresponding to a MeasuredValue in the range 0 to 10000.
         *
         * The maximum resolution this format allows is 0.01%.
         *
         * MinMeasuredValue and MaxMeasuredValue define the range of the sensor.
         *
         * The null value indicates that the measurement is unknown, otherwise the range shall be as described in
         * Measured Value.
         *
         * MeasuredValue is updated continuously as new measurements are made.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.1
         */
        measuredValue: number | null;

        /**
         * The MinMeasuredValue attribute indicates the minimum value of MeasuredValue that can be measured. The null
         * value means this attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.2
         */
        minMeasuredValue: number | null;

        /**
         * The MaxMeasuredValue attribute indicates the maximum value of MeasuredValue that can be measured. The null
         * value means this attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.4
         */
        tolerance?: number;
    }

    /**
     * Attributes that may appear in {@link RelativeHumidityMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Attributes {
        /**
         * MeasuredValue represents the water content in % as follows:
         *
         * MeasuredValue = 100 x water content
         *
         * Where 0% < = water content < = 100%, corresponding to a MeasuredValue in the range 0 to 10000.
         *
         * The maximum resolution this format allows is 0.01%.
         *
         * MinMeasuredValue and MaxMeasuredValue define the range of the sensor.
         *
         * The null value indicates that the measurement is unknown, otherwise the range shall be as described in
         * Measured Value.
         *
         * MeasuredValue is updated continuously as new measurements are made.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.1
         */
        measuredValue: number | null;

        /**
         * The MinMeasuredValue attribute indicates the minimum value of MeasuredValue that can be measured. The null
         * value means this attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.2
         */
        minMeasuredValue: number | null;

        /**
         * The MaxMeasuredValue attribute indicates the maximum value of MeasuredValue that can be measured. The null
         * value means this attribute is not defined. See Measured Value for more details.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.6.4.4
         */
        tolerance: number;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link RelativeHumidityMeasurement}.
     */
    export const Cluster: typeof RelativeHumidityMeasurement;

    /**
     * @deprecated Use {@link RelativeHumidityMeasurement}.
     */
    export const Complete: typeof RelativeHumidityMeasurement;

    export const Typing: RelativeHumidityMeasurement;
}

/**
 * @deprecated Use {@link RelativeHumidityMeasurement}.
 */
export declare const RelativeHumidityMeasurementCluster: typeof RelativeHumidityMeasurement;

export interface RelativeHumidityMeasurement extends ClusterTyping {
    Attributes: RelativeHumidityMeasurement.Attributes;
    Components: RelativeHumidityMeasurement.Components;
}
