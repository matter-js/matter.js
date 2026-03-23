/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute, FixedAttribute } from "../cluster/Cluster.js";
import { TlvFloat, TlvEnum, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ConcentrationMeasurement as ConcentrationMeasurementModel } from "@matter/model";

/**
 * Definitions for the ConcentrationMeasurement cluster.
 */
export namespace ConcentrationMeasurement {
    /**
     * {@link ConcentrationMeasurement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.10
             */
            readonly measurementMedium: MeasurementMedium;
        }
    }

    /**
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "NumericMeasurement".
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
            readonly measurementUnit: MeasurementUnit;

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
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "PeakMeasurement".
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
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "AverageMeasurement".
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
     * {@link ConcentrationMeasurement} supports these elements if it supports feature "LevelIndication".
     */
    export namespace LevelIndicationComponent {
        export interface Attributes {
            /**
             * Indicates the level of the substance detected. See LevelValueEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.11
             */
            readonly levelValue: LevelValue;
        }
    }

    /**
     * Attributes that may appear in {@link ConcentrationMeasurement}.
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
        readonly measurementMedium: MeasurementMedium;

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
        readonly measurementUnit: MeasurementUnit;

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
        readonly levelValue: LevelValue;
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
     * A ConcentrationMeasurementCluster supports these elements if it supports feature NumericMeasurement.
     */
    export const NumericMeasurementComponent = MutableCluster.Component({
        attributes: {
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
            measuredValue: Attribute(0x0, TlvNullable(TlvFloat)),

            /**
             * Indicates the minimum value of MeasuredValue that is capable of being measured. A MinMeasuredValue of
             * null indicates that the MinMeasuredValue is not defined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.2
             */
            minMeasuredValue: Attribute(0x1, TlvNullable(TlvFloat)),

            /**
             * Indicates the maximum value of MeasuredValue that is capable of being measured. A MaxMeasuredValue of
             * null indicates that the MaxMeasuredValue is not defined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.3
             */
            maxMeasuredValue: Attribute(0x2, TlvNullable(TlvFloat)),

            /**
             * Indicates the range of error or deviation that can be found in MeasuredValue and PeakMeasuredValue. This
             * is considered a +/- value and should be considered to be in MeasurementUnit.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.8
             */
            uncertainty: OptionalAttribute(0x7, TlvFloat),

            /**
             * Indicates the unit of MeasuredValue. See MeasurementUnitEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.9
             */
            measurementUnit: FixedAttribute(0x8, TlvEnum<MeasurementUnit>())
        }
    });

    /**
     * A ConcentrationMeasurementCluster supports these elements if it supports feature PeakMeasurement.
     */
    export const PeakMeasurementComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum value of MeasuredValue that has been measured during the PeakMeasuredValueWindow.
             * If this attribute is provided, the PeakMeasuredValueWindow attribute shall also be provided.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.4
             */
            peakMeasuredValue: Attribute(0x3, TlvNullable(TlvFloat)),

            /**
             * Indicates the window of time used for determining the PeakMeasuredValue. The value is in seconds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.5
             */
            peakMeasuredValueWindow: Attribute(0x4, TlvUInt32.bound({ max: 604800 }))
        }
    });

    /**
     * A ConcentrationMeasurementCluster supports these elements if it supports feature AverageMeasurement.
     */
    export const AverageMeasurementComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the average value of MeasuredValue that has been measured during the
             * AverageMeasuredValueWindow. If this attribute is provided, the AverageMeasuredValueWindow attribute shall
             * also be provided.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.6
             */
            averageMeasuredValue: Attribute(0x5, TlvNullable(TlvFloat)),

            /**
             * Indicates the window of time used for determining the AverageMeasuredValue. The value is in seconds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.7
             */
            averageMeasuredValueWindow: Attribute(0x6, TlvUInt32.bound({ max: 604800 }))
        }
    });

    /**
     * A ConcentrationMeasurementCluster supports these elements if it supports feature LevelIndication.
     */
    export const LevelIndicationComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the level of the substance detected. See LevelValueEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.11
             */
            levelValue: Attribute(0xa, TlvEnum<LevelValue>())
        }
    });

    /**
     * ConcentrationMeasurement is a derived cluster, not to be used directly. These elements are present in all
     * clusters derived from ConcentrationMeasurement.
     */
    export const Base = MutableCluster.Component({
        features: {
            /**
             * Cluster supports numeric measurement of substance
             */
            numericMeasurement: BitFlag(0),

            /**
             * Cluster supports basic level indication for substance using the ConcentrationLevel enum
             */
            levelIndication: BitFlag(1),

            /**
             * Cluster supports the Medium Concentration Level
             */
            mediumLevel: BitFlag(2),

            /**
             * Cluster supports the Critical Concentration Level
             */
            criticalLevel: BitFlag(3),

            /**
             * Cluster supports peak numeric measurement of substance
             */
            peakMeasurement: BitFlag(4),

            /**
             * Cluster supports average numeric measurement of substance
             */
            averageMeasurement: BitFlag(5)
        },

        name: "ConcentrationMeasurement",
        revision: 3,

        attributes: {
            /**
             * Indicates the medium in which MeasuredValue or LevelValue is being measured. See MeasurementMediumEnum.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.10.6.10
             */
            measurementMedium: FixedAttribute(0x9, TlvEnum<MeasurementMedium>())
        },

        /**
         * This metadata controls which ConcentrationMeasurementCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { numericMeasurement: true }, component: NumericMeasurementComponent },
            { flags: { peakMeasurement: true }, component: PeakMeasurementComponent },
            { flags: { averageMeasurement: true }, component: AverageMeasurementComponent },
            { flags: { levelIndication: true }, component: LevelIndicationComponent },
            { flags: { mediumLevel: true, levelIndication: false }, component: false },
            { flags: { criticalLevel: true, levelIndication: false }, component: false },
            { flags: { peakMeasurement: true, numericMeasurement: false }, component: false },
            { flags: { averageMeasurement: true, numericMeasurement: false }, component: false },
            { flags: { numericMeasurement: false, levelIndication: false }, component: false }
        )
    });

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ConcentrationMeasurement` instead of
     * `ConcentrationMeasurement.Complete`)
     */
    export type Complete = typeof ConcentrationMeasurement;

    export declare const Complete: Complete;
    export const name = "ConcentrationMeasurement" as const;
    export const revision = 3;
    export const schema = ConcentrationMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: ConcentrationMeasurement;
}

ClusterNamespace.define(ConcentrationMeasurement);
export interface ConcentrationMeasurement extends ClusterTyping { Attributes: ConcentrationMeasurement.Attributes; Features: ConcentrationMeasurement.Features; Components: ConcentrationMeasurement.Components }
