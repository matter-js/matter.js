/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { ConcentrationMeasurement } from "./concentration-measurement.js";

/**
 * Definitions for the Pm25ConcentrationMeasurement cluster.
 */
export declare namespace Pm25ConcentrationMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x042a;

    /**
     * Textual cluster identifier.
     */
    export const name: "Pm25ConcentrationMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 4;

    /**
     * Canonical metadata for the Pm25ConcentrationMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link Pm25ConcentrationMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.10
         */
        measurementMedium: ConcentrationMeasurement.MeasurementMedium;
    }

    /**
     * {@link Pm25ConcentrationMeasurement} supports these elements if it supports feature "NumericMeasurement".
     */
    export interface NumericMeasurementAttributes {
        /**
         * Indicates the most recent measurement as a single-precision floating-point number. MeasuredValue's unit is
         * represented by MeasurementUnit.
         *
         * A value of null indicates that the measurement is unknown or outside the valid range.
         *
         * MinMeasuredValue and MaxMeasuredValue define the valid range for MeasuredValue.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of null
         * indicates that the MinMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of null
         * indicates that the MaxMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.3
         */
        maxMeasuredValue: number | null;

        /**
         * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.9
         */
        measurementUnit: ConcentrationMeasurement.MeasurementUnit;

        /**
         * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This is
         * considered a +/- value and should be considered to be in MeasurementUnit.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.8
         */
        uncertainty?: number;
    }

    /**
     * {@link Pm25ConcentrationMeasurement} supports these elements if it supports feature "PeakMeasurement".
     */
    export interface PeakMeasurementAttributes {
        /**
         * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow. If
         * this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.4
         */
        peakMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.5
         */
        peakMeasuredValueWindow: number;
    }

    /**
     * {@link Pm25ConcentrationMeasurement} supports these elements if it supports feature "AverageMeasurement".
     */
    export interface AverageMeasurementAttributes {
        /**
         * Indicates the average value of MeasuredValue that has been measured during the AverageMeasuredValueWindow. If
         * this attribute is provided, the AverageMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.6
         */
        averageMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.7
         */
        averageMeasuredValueWindow: number;
    }

    /**
     * {@link Pm25ConcentrationMeasurement} supports these elements if it supports feature "LevelIndication".
     */
    export interface LevelIndicationAttributes {
        /**
         * Indicates the level of the substance detected. See LevelValueEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.11
         */
        levelValue: ConcentrationMeasurement.LevelValue;
    }

    /**
     * Attributes that may appear in {@link Pm25ConcentrationMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.10
         */
        measurementMedium: ConcentrationMeasurement.MeasurementMedium;

        /**
         * Indicates the most recent measurement as a single-precision floating-point number. MeasuredValue's unit is
         * represented by MeasurementUnit.
         *
         * A value of null indicates that the measurement is unknown or outside the valid range.
         *
         * MinMeasuredValue and MaxMeasuredValue define the valid range for MeasuredValue.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.1
         */
        measuredValue: number | null;

        /**
         * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of null
         * indicates that the MinMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.2
         */
        minMeasuredValue: number | null;

        /**
         * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of null
         * indicates that the MaxMeasuredValue is not defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.3
         */
        maxMeasuredValue: number | null;

        /**
         * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.9
         */
        measurementUnit: ConcentrationMeasurement.MeasurementUnit;

        /**
         * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This is
         * considered a +/- value and should be considered to be in MeasurementUnit.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.8
         */
        uncertainty: number;

        /**
         * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow. If
         * this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.4
         */
        peakMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.5
         */
        peakMeasuredValueWindow: number;

        /**
         * Indicates the average value of MeasuredValue that has been measured during the AverageMeasuredValueWindow. If
         * this attribute is provided, the AverageMeasuredValueWindow attribute shall also be provided.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.6
         */
        averageMeasuredValue: number | null;

        /**
         * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.7
         */
        averageMeasuredValueWindow: number;

        /**
         * Indicates the level of the substance detected. See LevelValueEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.10.6.11
         */
        levelValue: ConcentrationMeasurement.LevelValue;
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
     * These are optional features supported by Pm25ConcentrationMeasurementCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.10.4
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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link Pm25ConcentrationMeasurement}.
     */
    export const Cluster: ClusterType.WithCompat<typeof Pm25ConcentrationMeasurement, Pm25ConcentrationMeasurement>;

    /**
     * @deprecated Use {@link Pm25ConcentrationMeasurement}.
     */
    export const Complete: typeof Pm25ConcentrationMeasurement;

    export const Typing: Pm25ConcentrationMeasurement;
}

/**
 * @deprecated Use {@link Pm25ConcentrationMeasurement}.
 */
export declare const Pm25ConcentrationMeasurementCluster: typeof Pm25ConcentrationMeasurement;

export interface Pm25ConcentrationMeasurement extends ClusterTyping {
    Attributes: Pm25ConcentrationMeasurement.Attributes;
    Features: Pm25ConcentrationMeasurement.Features;
    Components: Pm25ConcentrationMeasurement.Components;
}
