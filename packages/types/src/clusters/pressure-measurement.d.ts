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
 * Definitions for the PressureMeasurement cluster.
 *
 * This cluster provides an interface to pressure measurement functionality, including configuration and provision of
 * notifications of pressure measurements.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.4
 */
export declare namespace PressureMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0403;

    /**
     * Textual cluster identifier.
     */
    export const name: "PressureMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the PressureMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link PressureMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the pressure in kPa as follows:
         *
         * MeasuredValue = 10 x Pressure [kPa]
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.4
         */
        tolerance?: number;
    }

    /**
     * {@link PressureMeasurement} supports these elements if it supports feature "Extended".
     */
    export interface ExtendedAttributes {
        /**
         * Indicates the pressure in Pascals as follows:
         *
         * ScaledValue = 10Scale x Pressure [Pa]
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.5
         */
        scaledValue: number | null;

        /**
         * Indicates the minimum value of ScaledValue that can be measured.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.6
         */
        minScaledValue: number | null;

        /**
         * Indicates the maximum value of ScaledValue that can be measured.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.7
         */
        maxScaledValue: number | null;

        /**
         * Indicates the base 10 exponent used to obtain ScaledValue (see ScaledValue).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.9
         */
        scale: number;

        /**
         * Indicates the magnitude of the possible error that is associated with ScaledValue. The true value is located
         * in the range
         *
         * (ScaledValue – ScaledTolerance) to (ScaledValue + ScaledTolerance).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.8
         */
        scaledTolerance?: number;
    }

    /**
     * Attributes that may appear in {@link PressureMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the pressure in kPa as follows:
         *
         * MeasuredValue = 10 x Pressure [kPa]
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.3
         */
        maxMeasuredValue: number | null;

        /**
         * See Measured Value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.4
         */
        tolerance: number;

        /**
         * Indicates the pressure in Pascals as follows:
         *
         * ScaledValue = 10Scale x Pressure [Pa]
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.5
         */
        scaledValue: number | null;

        /**
         * Indicates the minimum value of ScaledValue that can be measured.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.6
         */
        minScaledValue: number | null;

        /**
         * Indicates the maximum value of ScaledValue that can be measured.
         *
         * The null value indicates that the value is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.7
         */
        maxScaledValue: number | null;

        /**
         * Indicates the base 10 exponent used to obtain ScaledValue (see ScaledValue).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.9
         */
        scale: number;

        /**
         * Indicates the magnitude of the possible error that is associated with ScaledValue. The true value is located
         * in the range
         *
         * (ScaledValue – ScaledTolerance) to (ScaledValue + ScaledTolerance).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.8
         */
        scaledTolerance: number;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { extended: true }, attributes: ExtendedAttributes }
    ];
    export type Features = "Extended";

    /**
     * These are optional features supported by PressureMeasurementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.4.4
     */
    export enum Feature {
        /**
         * Extended (EXT)
         *
         * Extended range and resolution
         */
        Extended = "Extended"
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link PressureMeasurement}.
     */
    export const Cluster: typeof PressureMeasurement;

    /**
     * @deprecated Use {@link PressureMeasurement}.
     */
    export const Complete: typeof PressureMeasurement;

    export const Typing: PressureMeasurement;
}

/**
 * @deprecated Use {@link PressureMeasurement}.
 */
export declare const PressureMeasurementCluster: typeof PressureMeasurement;

export interface PressureMeasurement extends ClusterTyping {
    Attributes: PressureMeasurement.Attributes;
    Features: PressureMeasurement.Features;
    Components: PressureMeasurement.Components;
}
