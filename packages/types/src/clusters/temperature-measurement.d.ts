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
 * Definitions for the TemperatureMeasurement cluster.
 *
 * This cluster provides an interface to temperature measurement functionality, including configuration and provision of
 * notifications of temperature measurements.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.3
 */
export declare namespace TemperatureMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0402;

    /**
     * Textual cluster identifier.
     */
    export const name: "TemperatureMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the TemperatureMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TemperatureMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the measured temperature.
         *
         * The null value indicates that the temperature is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. See Measured Value for more
         * details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.2
         */
        minMeasuredValue: number | null;

        /**
         * This attribute indicates the maximum value of MeasuredValue that is capable of being measured. See Measured
         * Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.4
         */
        tolerance?: number;
    }

    /**
     * Attributes that may appear in {@link TemperatureMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Attributes {
        /**
         * Indicates the measured temperature.
         *
         * The null value indicates that the temperature is unknown.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. See Measured Value for more
         * details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.2
         */
        minMeasuredValue: number | null;

        /**
         * This attribute indicates the maximum value of MeasuredValue that is capable of being measured. See Measured
         * Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.3.4.4
         */
        tolerance: number;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link TemperatureMeasurement}.
     */
    export const Cluster: typeof TemperatureMeasurement;

    /**
     * @deprecated Use {@link TemperatureMeasurement}.
     */
    export const Complete: typeof TemperatureMeasurement;

    export const Typing: TemperatureMeasurement;
}

/**
 * @deprecated Use {@link TemperatureMeasurement}.
 */
export declare const TemperatureMeasurementCluster: typeof TemperatureMeasurement;

export interface TemperatureMeasurement extends ClusterTyping {
    Attributes: TemperatureMeasurement.Attributes;
    Components: TemperatureMeasurement.Components;
}
