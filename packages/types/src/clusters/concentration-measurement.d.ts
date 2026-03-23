/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the ConcentrationMeasurement cluster.
 *
 * The server cluster provides an interface to concentration measurement functionality.
 *
 * This cluster shall to be used via an alias to a specific substance (see Cluster IDs).
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.10
 */
export declare namespace ConcentrationMeasurement {
    /**
     * Textual cluster identifier.
     */
    export const name: "ConcentrationMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the ConcentrationMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ConcentrationMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.10
         */
        measurementMedium: MeasurementMedium;
    }

    /**
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "NumericMeasurement".
     */
    export interface NumericMeasurementAttributes {
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
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of null
         * indicates that the MinMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of null
         * indicates that the MaxMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.3
         */
        maxMeasuredValue: number | null;

        /**
         * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.9
         */
        measurementUnit: MeasurementUnit;

        /**
         * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This is
         * considered a +/- value and should be considered to be in MeasurementUnit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.8
         */
        uncertainty?: number;
    }

    /**
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "PeakMeasurement".
     */
    export interface PeakMeasurementAttributes {
        /**
         * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow. If
         * this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.4
         */
        peakMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.5
         */
        peakMeasuredValueWindow: number;
    }

    /**
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "AverageMeasurement".
     */
    export interface AverageMeasurementAttributes {
        /**
         * Indicates the average value of MeasuredValue that has been measured during the AverageMeasuredValueWindow. If
         * this attribute is provided, the AverageMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.6
         */
        averageMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.7
         */
        averageMeasuredValueWindow: number;
    }

    /**
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "LevelIndication".
     */
    export interface LevelIndicationAttributes {
        /**
         * Indicates the level of the substance detected. See LevelValueEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.11
         */
        levelValue: LevelValue;
    }

    /**
     * Attributes that may appear in {@link ConcentrationMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.10
         */
        measurementMedium: MeasurementMedium;

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
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of null
         * indicates that the MinMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of null
         * indicates that the MaxMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.3
         */
        maxMeasuredValue: number | null;

        /**
         * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.9
         */
        measurementUnit: MeasurementUnit;

        /**
         * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This is
         * considered a +/- value and should be considered to be in MeasurementUnit.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.8
         */
        uncertainty: number;

        /**
         * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow. If
         * this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.4
         */
        peakMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.5
         */
        peakMeasuredValueWindow: number;

        /**
         * Indicates the average value of MeasuredValue that has been measured during the AverageMeasuredValueWindow. If
         * this attribute is provided, the AverageMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.6
         */
        averageMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.7
         */
        averageMeasuredValueWindow: number;

        /**
         * Indicates the level of the substance detected. See LevelValueEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.11
         */
        levelValue: LevelValue;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        { flags: { numericMeasurement: true }, attributes: NumericMeasurementAttributes },
        { flags: { peakMeasurement: true }, attributes: PeakMeasurementAttributes },
        { flags: { averageMeasurement: true }, attributes: AverageMeasurementAttributes },
        { flags: { levelIndication: true }, attributes: LevelIndicationAttributes }
    ];

    export type Features = "NumericMeasurement" | "LevelIndication" | "MediumLevel" | "CriticalLevel" | "PeakMeasurement" | "AverageMeasurement";

    /**
     * These are optional features supported by ConcentrationMeasurementCluster.
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

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.10.5.2
     */
    export enum MeasurementMedium {
        /**
         * The measurement is being made in Air
         */
        Air = 0,

        /**
         * The measurement is being made in Water
         */
        Water = 1,

        /**
         * The measurement is being made in Soil
         */
        Soil = 2
    }

    /**
     * Where mentioned, Billion refers to 10^9, Trillion refers to 10^12 (short scale).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.10.5.1
     */
    export enum MeasurementUnit {
        /**
         * Parts per Million (10^6)
         */
        Ppm = 0,

        /**
         * Parts per Billion (10^9)
         */
        Ppb = 1,

        /**
         * Parts per Trillion (10^12)
         */
        Ppt = 2,

        /**
         * Milligram per m^3
         */
        Mgm3 = 3,

        /**
         * Microgram per m^3
         */
        Ugm3 = 4,

        /**
         * Nanogram per m^3
         */
        Ngm3 = 5,

        /**
         * Particles per m^3
         */
        Pm3 = 6,

        /**
         * Becquerel per m^3
         */
        Bqm3 = 7
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.10.5.3
     */
    export enum LevelValue {
        /**
         * The level is Unknown
         */
        Unknown = 0,

        /**
         * The level is considered Low
         */
        Low = 1,

        /**
         * The level is considered Medium
         */
        Medium = 2,

        /**
         * The level is considered High
         */
        High = 3,

        /**
         * The level is considered Critical
         */
        Critical = 4
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use {@link ConcentrationMeasurement}.
     */
    export const Complete: typeof ConcentrationMeasurement;

    export const Typing: ConcentrationMeasurement;
}

export interface ConcentrationMeasurement extends ClusterTyping {
    Attributes: ConcentrationMeasurement.Attributes;
    Features: ConcentrationMeasurement.Features;
    Components: ConcentrationMeasurement.Components;
}
