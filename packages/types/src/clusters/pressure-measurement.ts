/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { PressureMeasurement as PressureMeasurementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the PressureMeasurement cluster.
 */
export namespace PressureMeasurement {
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

    /**
     * Attributes that may appear in {@link PressureMeasurement}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
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
        readonly tolerance: number;

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
         * Indicates the magnitude of the possible error that is associated with ScaledValue. The true value is located
         * in the range
         *
         * (ScaledValue – ScaledTolerance) to (ScaledValue + ScaledTolerance).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.4.5.8
         */
        readonly scaledTolerance: number;
    }

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

    export const id = ClusterId(0x403);
    export const name = "PressureMeasurement" as const;
    export const revision = 3;
    export const schema = PressureMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof PressureMeasurement;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `PressureMeasurement` instead of
     * `PressureMeasurement.Complete`)
     */
    export type Complete = typeof PressureMeasurement;

    export declare const Complete: Complete;
    export declare const Typing: PressureMeasurement;
}

ClusterNamespace.define(PressureMeasurement);
export type PressureMeasurementCluster = PressureMeasurement.Cluster;
export const PressureMeasurementCluster = PressureMeasurement.Cluster;
export interface PressureMeasurement extends ClusterTyping { Attributes: PressureMeasurement.Attributes; Features: PressureMeasurement.Features; Components: PressureMeasurement.Components }
