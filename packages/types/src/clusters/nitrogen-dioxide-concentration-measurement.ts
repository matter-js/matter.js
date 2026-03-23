/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { ConcentrationMeasurement } from "./concentration-measurement.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { NitrogenDioxideConcentrationMeasurement as NitrogenDioxideConcentrationMeasurementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the NitrogenDioxideConcentrationMeasurement cluster.
 */
export namespace NitrogenDioxideConcentrationMeasurement {
    /**
     * Attributes that may appear in {@link NitrogenDioxideConcentrationMeasurement}.
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
        measurementMedium: ConcentrationMeasurement.MeasurementMedium;

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
        measurementUnit: ConcentrationMeasurement.MeasurementUnit;

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
        levelValue: ConcentrationMeasurement.LevelValue;
    }

    export namespace Attributes {
        export type Components = [
            { flags: {}, mandatory: "measurementMedium" },
            {
                flags: { numericMeasurement: true },
                mandatory: "measuredValue" | "minMeasuredValue" | "maxMeasuredValue" | "measurementUnit",
                optional: "uncertainty"
            },
            { flags: { peakMeasurement: true }, mandatory: "peakMeasuredValue" | "peakMeasuredValueWindow" },
            { flags: { averageMeasurement: true }, mandatory: "averageMeasuredValue" | "averageMeasuredValueWindow" },
            { flags: { levelIndication: true }, mandatory: "levelValue" }
        ];
    }

    export type Features = "NumericMeasurement" | "LevelIndication" | "MediumLevel" | "CriticalLevel" | "PeakMeasurement" | "AverageMeasurement";

    export const Base = {
        ...ConcentrationMeasurement.Base,
        id: 0x413,
        name: "NitrogenDioxideConcentrationMeasurement"
    } as const;

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This alias specializes the semantics of {@link ConcentrationMeasurement.Base}.
     *
     * Per the Matter specification you cannot use {@link NitrogenDioxideConcentrationMeasurementCluster} without
     * enabling certain feature combinations. You must use the {@link with} factory method to obtain a working cluster.
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * This cluster supports all NitrogenDioxideConcentrationMeasurement features. It may support illegal feature
     * combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export const CompleteInstance = MutableCluster({
        ...ConcentrationMeasurement.Complete,
        id: 0x413,
        name: "NitrogenDioxideConcentrationMeasurement"
    });

    export interface Complete extends Identity<typeof CompleteInstance> {}
    export const Complete: Complete = CompleteInstance;
    export const id = ClusterId(0x413);
    export const name = "NitrogenDioxideConcentrationMeasurement" as const;
    export const revision = 1;
    export const schema = NitrogenDioxideConcentrationMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: NitrogenDioxideConcentrationMeasurement;
}

export type NitrogenDioxideConcentrationMeasurementCluster = NitrogenDioxideConcentrationMeasurement.Cluster;
export const NitrogenDioxideConcentrationMeasurementCluster = NitrogenDioxideConcentrationMeasurement.Cluster;
ClusterRegistry.register(NitrogenDioxideConcentrationMeasurement.Complete);
ClusterNamespace.define(NitrogenDioxideConcentrationMeasurement);
export interface NitrogenDioxideConcentrationMeasurement extends ClusterTyping { Attributes: NitrogenDioxideConcentrationMeasurement.Attributes & { Components: NitrogenDioxideConcentrationMeasurement.Attributes.Components }; Features: NitrogenDioxideConcentrationMeasurement.Features }
