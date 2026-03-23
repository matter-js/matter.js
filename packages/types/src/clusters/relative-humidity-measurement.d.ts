/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { RelativeHumidityMeasurement as RelativeHumidityMeasurementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the RelativeHumidityMeasurement cluster.
 */
export declare namespace RelativeHumidityMeasurement {
    /**
     * {@link RelativeHumidityMeasurement} always supports these elements.
     */
    export namespace Base {
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
             * @see {@link MatterSpecification.v142.Cluster} § 2.6.4.1
             */
            readonly measuredValue: number | null;

            /**
             * The MinMeasuredValue attribute indicates the minimum value of MeasuredValue that can be measured. The
             * null value means this attribute is not defined. See Measured Value for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.6.4.2
             */
            readonly minMeasuredValue: number | null;

            /**
             * The MaxMeasuredValue attribute indicates the maximum value of MeasuredValue that can be measured. The
             * null value means this attribute is not defined. See Measured Value for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.6.4.3
             */
            readonly maxMeasuredValue: number | null;

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.6.4.4
             */
            readonly tolerance?: number;
        }
    }

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "RelativeHumidityMeasurement";
    export const revision: 3;
    export const schema: typeof RelativeHumidityMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof RelativeHumidityMeasurement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `RelativeHumidityMeasurement` instead of
     * `RelativeHumidityMeasurement.Complete`)
     */
    export const Complete: typeof RelativeHumidityMeasurement;

    export const Typing: RelativeHumidityMeasurement;
}

export declare const RelativeHumidityMeasurementCluster: typeof RelativeHumidityMeasurement;
export interface RelativeHumidityMeasurement extends ClusterTyping { Attributes: RelativeHumidityMeasurement.Attributes; Components: RelativeHumidityMeasurement.Components }
