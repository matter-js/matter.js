/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { FlowMeasurement as FlowMeasurementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the FlowMeasurement cluster.
 */
export declare namespace FlowMeasurement {
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

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];

    export const id: ClusterId;
    export const name: "FlowMeasurement";
    export const revision: 3;
    export const schema: typeof FlowMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const Cluster: typeof FlowMeasurement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `FlowMeasurement` instead of `FlowMeasurement.Complete`)
     */
    export const Complete: typeof FlowMeasurement;

    export const Typing: FlowMeasurement;
}

export declare const FlowMeasurementCluster: typeof FlowMeasurement;
export interface FlowMeasurement extends ClusterTyping { Attributes: FlowMeasurement.Attributes; Components: FlowMeasurement.Components }
