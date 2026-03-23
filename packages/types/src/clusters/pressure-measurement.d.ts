/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { PressureMeasurement as PressureMeasurementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the PressureMeasurement cluster.
 */
export declare namespace PressureMeasurement {
    /**
     * {@link PressureMeasurement} always supports these elements.
     */
    export namespace Base {
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
            readonly measuredValue: number | null;

            /**
             * Indicates the minimum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.2
             */
            readonly minMeasuredValue: number | null;

            /**
             * Indicates the maximum value of MeasuredValue that can be measured. See Measured Value for more details.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.3
             */
            readonly maxMeasuredValue: number | null;

            /**
             * See Measured Value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.4
             */
            readonly tolerance?: number;
        }
    }

    /**
     * {@link PressureMeasurement} supports these elements if it supports feature "Extended".
     */
    export namespace ExtendedComponent {
        export interface Attributes {
            /**
             * Indicates the pressure in Pascals as follows:
             *
             * ScaledValue = 10Scale x Pressure [Pa]
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.5
             */
            readonly scaledValue: number | null;

            /**
             * Indicates the minimum value of ScaledValue that can be measured.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.6
             */
            readonly minScaledValue: number | null;

            /**
             * Indicates the maximum value of ScaledValue that can be measured.
             *
             * The null value indicates that the value is not available.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.7
             */
            readonly maxScaledValue: number | null;

            /**
             * Indicates the base 10 exponent used to obtain ScaledValue (see ScaledValue).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.9
             */
            readonly scale: number;

            /**
             * Indicates the magnitude of the possible error that is associated with ScaledValue. The true value is
             * located in the range
             *
             * (ScaledValue – ScaledTolerance) to (ScaledValue + ScaledTolerance).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.8
             */
            readonly scaledTolerance?: number;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<ExtendedComponent.Attributes> {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        { flags: { extended: true }, attributes: ExtendedComponent.Attributes }
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

    export const id: ClusterId;
    export const name: "PressureMeasurement";
    export const revision: 3;
    export const schema: typeof PressureMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof PressureMeasurement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `PressureMeasurement` instead of
     * `PressureMeasurement.Complete`)
     */
    export const Complete: typeof PressureMeasurement;

    export const Typing: PressureMeasurement;
}

export declare const PressureMeasurementCluster: typeof PressureMeasurement;
export interface PressureMeasurement extends ClusterTyping { Attributes: PressureMeasurement.Attributes; Features: PressureMeasurement.Features; Components: PressureMeasurement.Components }
