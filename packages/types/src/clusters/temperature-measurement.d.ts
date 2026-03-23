/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { TemperatureMeasurement as TemperatureMeasurementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the TemperatureMeasurement cluster.
 */
export declare namespace TemperatureMeasurement {
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

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "TemperatureMeasurement";
    export const revision: 4;
    export const schema: typeof TemperatureMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof TemperatureMeasurement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `TemperatureMeasurement` instead of
     * `TemperatureMeasurement.Complete`)
     */
    export const Complete: typeof TemperatureMeasurement;

    export const Typing: TemperatureMeasurement;
}

export declare const TemperatureMeasurementCluster: typeof TemperatureMeasurement;
export interface TemperatureMeasurement extends ClusterTyping { Attributes: TemperatureMeasurement.Attributes; Components: TemperatureMeasurement.Components }
