/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ConcentrationMeasurement } from "./concentration-measurement.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { OzoneConcentrationMeasurement as OzoneConcentrationMeasurementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the OzoneConcentrationMeasurement cluster.
 */
export declare namespace OzoneConcentrationMeasurement {
    /**
     * {@link OzoneConcentrationMeasurement} always supports these elements.
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
     * {@link OzoneConcentrationMeasurement} supports these elements if it supports feature "NumericMeasurement".
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
     * {@link OzoneConcentrationMeasurement} supports these elements if it supports feature "PeakMeasurement".
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
     * {@link OzoneConcentrationMeasurement} supports these elements if it supports feature "AverageMeasurement".
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
     * {@link OzoneConcentrationMeasurement} supports these elements if it supports feature "LevelIndication".
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

    export interface Attributes extends Base.Attributes, Partial<NumericMeasurementComponent.Attributes>, Partial<PeakMeasurementComponent.Attributes>, Partial<AverageMeasurementComponent.Attributes>, Partial<LevelIndicationComponent.Attributes> {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        { flags: { numericMeasurement: true }, attributes: NumericMeasurementComponent.Attributes },
        { flags: { peakMeasurement: true }, attributes: PeakMeasurementComponent.Attributes },
        { flags: { averageMeasurement: true }, attributes: AverageMeasurementComponent.Attributes },
        { flags: { levelIndication: true }, attributes: LevelIndicationComponent.Attributes }
    ];

    export type Features = "NumericMeasurement" | "LevelIndication" | "MediumLevel" | "CriticalLevel" | "PeakMeasurement" | "AverageMeasurement";

    /**
     * These are optional features supported by OzoneConcentrationMeasurementCluster.
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

    export const id: ClusterId;
    export const name: "OzoneConcentrationMeasurement";
    export const revision: 3;
    export const schema: typeof OzoneConcentrationMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof OzoneConcentrationMeasurement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `OzoneConcentrationMeasurement` instead of
     * `OzoneConcentrationMeasurement.Complete`)
     */
    export const Complete: typeof OzoneConcentrationMeasurement;

    export const Typing: OzoneConcentrationMeasurement;
}

export declare const OzoneConcentrationMeasurementCluster: typeof OzoneConcentrationMeasurement;
export interface OzoneConcentrationMeasurement extends ClusterTyping { Attributes: OzoneConcentrationMeasurement.Attributes; Features: OzoneConcentrationMeasurement.Features; Components: OzoneConcentrationMeasurement.Components }
