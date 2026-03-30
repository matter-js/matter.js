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
 * Definitions for the FlowMeasurement cluster.
 *
 * This cluster provides an interface to flow measurement functionality, including configuration and provision of
 * notifications of flow measurements.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.5
 */
export declare namespace FlowMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0404;

    /**
     * Textual cluster identifier.
     */
    export const name: "FlowMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the FlowMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link FlowMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the flow in m^3/h as follows:
         *
         * MeasuredValue = 10 x Flow
         *
         * The null value indicates that the flow measurement is unknown, otherwise the range shall be as described in
         * Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.4
         */
        tolerance?: number;
    }

    /**
     * Attributes that may appear in {@link FlowMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory.
     */
    export interface Attributes {
        /**
         * Indicates the flow in m^3/h as follows:
         *
         * MeasuredValue = 10 x Flow
         *
         * The null value indicates that the flow measurement is unknown, otherwise the range shall be as described in
         * Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.5.4.4
         */
        tolerance: number;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link FlowMeasurement}.
     */
    export const Cluster: typeof FlowMeasurement;

    /**
     * @deprecated Use {@link FlowMeasurement}.
     */
    export const Complete: typeof FlowMeasurement;

    export const Typing: FlowMeasurement;
}

/**
 * @deprecated Use {@link FlowMeasurement}.
 */
export declare const FlowMeasurementCluster: typeof FlowMeasurement;

export interface FlowMeasurement extends ClusterTyping {
    Attributes: FlowMeasurement.Attributes;
    Components: FlowMeasurement.Components;
}
