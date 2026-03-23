/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ConcentrationMeasurement } from "./concentration-measurement.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import {
    TotalVolatileOrganicCompoundsConcentrationMeasurement as TotalVolatileOrganicCompoundsConcentrationMeasurementModel
} from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the TotalVolatileOrganicCompoundsConcentrationMeasurement cluster.
 */
export namespace TotalVolatileOrganicCompoundsConcentrationMeasurement {
    /**
     * {@link TotalVolatileOrganicCompoundsConcentrationMeasurement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.10
             */
            readonly measurementMedium: ConcentrationMeasurement.MeasurementMedium;
        }
    }

    /**
     * {@link TotalVolatileOrganicCompoundsConcentrationMeasurement} supports these elements if it supports feature
     * "NumericMeasurement".
     */
    export namespace NumericMeasurementComponent {
        export interface Attributes {
            /**
             * Indicates the most recent measurement as a single-precision floating-point number. MeasuredValue’s unit
             * is represented by MeasurementUnit.
             *
             * A value of null indicates that the measurement is unknown or outside the valid range.
             *
             * MinMeasuredValue and MaxMeasuredValue define the valid range for MeasuredValue.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.1
             */
            readonly measuredValue: number | null;

            /**
             * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of
             * null indicates that the MinMeasuredValue is not defined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.2
             */
            readonly minMeasuredValue: number | null;

            /**
             * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of
             * null indicates that the MaxMeasuredValue is not defined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.3
             */
            readonly maxMeasuredValue: number | null;

            /**
             * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.9
             */
            readonly measurementUnit: ConcentrationMeasurement.MeasurementUnit;

            /**
             * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This
             * is considered a +/- value and should be considered to be in MeasurementUnit.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.8
             */
            readonly uncertainty?: number;
        }
    }

    /**
     * {@link TotalVolatileOrganicCompoundsConcentrationMeasurement} supports these elements if it supports feature
     * "PeakMeasurement".
     */
    export namespace PeakMeasurementComponent {
        export interface Attributes {
            /**
             * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow.
             * If this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.4
             */
            readonly peakMeasuredValue: number | null;

            /**
             * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.5
             */
            readonly peakMeasuredValueWindow: number;
        }
    }

    /**
     * {@link TotalVolatileOrganicCompoundsConcentrationMeasurement} supports these elements if it supports feature
     * "AverageMeasurement".
     */
    export namespace AverageMeasurementComponent {
        export interface Attributes {
            /**
             * Indicates the average value of MeasuredValue that has been measured during the
             * AverageMeasuredValueWindow. If this attribute is provided, the AverageMeasuredValueWindow attribute shall
             * also be provided.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.6
             */
            readonly averageMeasuredValue: number | null;

            /**
             * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.7
             */
            readonly averageMeasuredValueWindow: number;
        }
    }

    /**
     * {@link TotalVolatileOrganicCompoundsConcentrationMeasurement} supports these elements if it supports feature
     * "LevelIndication".
     */
    export namespace LevelIndicationComponent {
        export interface Attributes {
            /**
             * Indicates the level of the substance detected. See LevelValueEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.11
             */
            readonly levelValue: ConcentrationMeasurement.LevelValue;
        }
    }

    /**
     * Attributes that may appear in {@link TotalVolatileOrganicCompoundsConcentrationMeasurement}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.10
         */
        readonly measurementMedium: ConcentrationMeasurement.MeasurementMedium;

        /**
         * Indicates the most recent measurement as a single-precision floating-point number. MeasuredValue’s unit is
         * represented by MeasurementUnit.
         *
         * A value of null indicates that the measurement is unknown or outside the valid range.
         *
         * MinMeasuredValue and MaxMeasuredValue define the valid range for MeasuredValue.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.1
         */
        readonly measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of null
         * indicates that the MinMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.2
         */
        readonly minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of null
         * indicates that the MaxMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.3
         */
        readonly maxMeasuredValue: number | null;

        /**
         * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.9
         */
        readonly measurementUnit: ConcentrationMeasurement.MeasurementUnit;

        /**
         * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This is
         * considered a +/- value and should be considered to be in MeasurementUnit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.8
         */
        readonly uncertainty: number;

        /**
         * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow. If
         * this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.4
         */
        readonly peakMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.5
         */
        readonly peakMeasuredValueWindow: number;

        /**
         * Indicates the average value of MeasuredValue that has been measured during the AverageMeasuredValueWindow. If
         * this attribute is provided, the AverageMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.6
         */
        readonly averageMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.7
         */
        readonly averageMeasuredValueWindow: number;

        /**
         * Indicates the level of the substance detected. See LevelValueEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.11
         */
        readonly levelValue: ConcentrationMeasurement.LevelValue;
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        { flags: { numericMeasurement: true }, attributes: NumericMeasurementComponent.Attributes },
        { flags: { peakMeasurement: true }, attributes: PeakMeasurementComponent.Attributes },
        { flags: { averageMeasurement: true }, attributes: AverageMeasurementComponent.Attributes },
        { flags: { levelIndication: true }, attributes: LevelIndicationComponent.Attributes }
    ];

    export type Features = "NumericMeasurement" | "LevelIndication" | "MediumLevel" | "CriticalLevel" | "PeakMeasurement" | "AverageMeasurement";

    /**
     * These are optional features supported by TotalVolatileOrganicCompoundsConcentrationMeasurementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.10.4
     */
    export enum Feature {
        /**
         * NumericMeasurement (MEA)
         *
         * Cluster supports numeric measurement of substance
         */
        NumericMeasurement = "NumericMeasurement",

        /**
         * LevelIndication (LEV)
         *
         * Cluster supports basic level indication for substance using the ConcentrationLevel enum
         */
        LevelIndication = "LevelIndication",

        /**
         * MediumLevel (MED)
         *
         * Cluster supports the Medium Concentration Level
         */
        MediumLevel = "MediumLevel",

        /**
         * CriticalLevel (CRI)
         *
         * Cluster supports the Critical Concentration Level
         */
        CriticalLevel = "CriticalLevel",

        /**
         * PeakMeasurement (PEA)
         *
         * Cluster supports peak numeric measurement of substance
         */
        PeakMeasurement = "PeakMeasurement",

        /**
         * AverageMeasurement (AVG)
         *
         * Cluster supports average numeric measurement of substance
         */
        AverageMeasurement = "AverageMeasurement"
    }

    export const id = ClusterId(0x42e);
    export const name = "TotalVolatileOrganicCompoundsConcentrationMeasurement" as const;
    export const revision = 3;
    export const schema = TotalVolatileOrganicCompoundsConcentrationMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof TotalVolatileOrganicCompoundsConcentrationMeasurement;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `TotalVolatileOrganicCompoundsConcentrationMeasurement`
     * instead of `TotalVolatileOrganicCompoundsConcentrationMeasurement.Complete`)
     */
    export type Complete = typeof TotalVolatileOrganicCompoundsConcentrationMeasurement;

    export declare const Complete: Complete;
    export declare const Typing: TotalVolatileOrganicCompoundsConcentrationMeasurement;
}

ClusterNamespace.define(TotalVolatileOrganicCompoundsConcentrationMeasurement);
export type TotalVolatileOrganicCompoundsConcentrationMeasurementCluster = TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster;
export const TotalVolatileOrganicCompoundsConcentrationMeasurementCluster = TotalVolatileOrganicCompoundsConcentrationMeasurement.Cluster;
export interface TotalVolatileOrganicCompoundsConcentrationMeasurement extends ClusterTyping { Attributes: TotalVolatileOrganicCompoundsConcentrationMeasurement.Attributes; Features: TotalVolatileOrganicCompoundsConcentrationMeasurement.Features; Components: TotalVolatileOrganicCompoundsConcentrationMeasurement.Components }
