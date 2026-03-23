/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MeasurementAccuracy } from "../globals/MeasurementAccuracy.js";

/**
 * Definitions for the ElectricalEnergyMeasurement cluster.
 *
 * This cluster provides a mechanism for querying data about the electrical energy imported or provided by the server.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.12
 */
export declare namespace ElectricalEnergyMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0091;

    /**
     * Textual cluster identifier.
     */
    export const name: "ElectricalEnergyMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ElectricalEnergyMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ElectricalEnergyMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the accuracy of energy measurement by this server. The value of the MeasurementType field on this
         * MeasurementAccuracyStruct shall be ElectricalEnergy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.1
         */
        accuracy: MeasurementAccuracy;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ImportedEnergyAndCumulativeEnergy".
     */
    export interface ImportedEnergyAndCumulativeEnergyAttributes {
        /**
         * Indicates the most recent measurement of cumulative energy imported by the server over the lifetime of the
         * device, and the timestamp of when the measurement was recorded.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the cumulative energy imported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.2
         */
        cumulativeEnergyImported: EnergyMeasurement | null;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ExportedEnergyAndCumulativeEnergy".
     */
    export interface ExportedEnergyAndCumulativeEnergyAttributes {
        /**
         * Indicates the most recent measurement of cumulative energy exported by the server over the lifetime of the
         * device, and the timestamp of when the measurement was recorded.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the cumulative energy exported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.3
         */
        cumulativeEnergyExported: EnergyMeasurement | null;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ImportedEnergyAndPeriodicEnergy".
     */
    export interface ImportedEnergyAndPeriodicEnergyAttributes {
        /**
         * Indicates the most recent measurement of energy imported by the server and the period during which it was
         * measured.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the periodic energy imported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.4
         */
        periodicEnergyImported: EnergyMeasurement | null;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ExportedEnergyAndPeriodicEnergy".
     */
    export interface ExportedEnergyAndPeriodicEnergyAttributes {
        /**
         * Indicates the most recent measurement of energy exported by the server and the period during which it was
         * measured.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the periodic energy exported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.5
         */
        periodicEnergyExported: EnergyMeasurement | null;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature "CumulativeEnergy".
     */
    export interface CumulativeEnergyAttributes {
        /**
         * Indicates when cumulative measurements were most recently zero.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.6
         */
        cumulativeEnergyReset?: CumulativeEnergyReset | null;
    }

    /**
     * Attributes that may appear in {@link ElectricalEnergyMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the accuracy of energy measurement by this server. The value of the MeasurementType field on this
         * MeasurementAccuracyStruct shall be ElectricalEnergy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.1
         */
        accuracy: MeasurementAccuracy;

        /**
         * Indicates the most recent measurement of cumulative energy imported by the server over the lifetime of the
         * device, and the timestamp of when the measurement was recorded.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the cumulative energy imported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.2
         */
        cumulativeEnergyImported: EnergyMeasurement | null;

        /**
         * Indicates the most recent measurement of cumulative energy exported by the server over the lifetime of the
         * device, and the timestamp of when the measurement was recorded.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the cumulative energy exported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.3
         */
        cumulativeEnergyExported: EnergyMeasurement | null;

        /**
         * Indicates the most recent measurement of energy imported by the server and the period during which it was
         * measured.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the periodic energy imported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.4
         */
        periodicEnergyImported: EnergyMeasurement | null;

        /**
         * Indicates the most recent measurement of energy exported by the server and the period during which it was
         * measured.
         *
         * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
         * publication of deltas considered not meaningful.
         *
         * The server shall NOT mark this attribute ready for report if the last time this was done was more recently
         * than 1 second ago.
         *
         * The server may delay marking this attribute ready for report for longer periods if needed, however the server
         * shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
         *
         * If the periodic energy exported cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.5
         */
        periodicEnergyExported: EnergyMeasurement | null;

        /**
         * Indicates when cumulative measurements were most recently zero.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.6
         */
        cumulativeEnergyReset: CumulativeEnergyReset | null;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature "CumulativeEnergy".
     */
    export interface CumulativeEnergyEvents {
        /**
         * This event shall be generated when the server takes a snapshot of the cumulative energy imported by the
         * server, exported from the server, or both, but not more frequently than the rate mentioned in the description
         * above of the related attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1
         */
        cumulativeEnergyMeasured: CumulativeEnergyMeasuredEvent;
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature "PeriodicEnergy".
     */
    export interface PeriodicEnergyEvents {
        /**
         * This event shall be generated when the server reaches the end of a reporting period for imported energy,
         * exported energy, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2
         */
        periodicEnergyMeasured: PeriodicEnergyMeasuredEvent;
    }

    /**
     * Events that may appear in {@link ElectricalEnergyMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the server takes a snapshot of the cumulative energy imported by the
         * server, exported from the server, or both, but not more frequently than the rate mentioned in the description
         * above of the related attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1
         */
        cumulativeEnergyMeasured: CumulativeEnergyMeasuredEvent;

        /**
         * This event shall be generated when the server reaches the end of a reporting period for imported energy,
         * exported energy, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2
         */
        periodicEnergyMeasured: PeriodicEnergyMeasuredEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes },
        {
            flags: { importedEnergy: true, cumulativeEnergy: true },
            attributes: ImportedEnergyAndCumulativeEnergyAttributes
        },
        {
            flags: { exportedEnergy: true, cumulativeEnergy: true },
            attributes: ExportedEnergyAndCumulativeEnergyAttributes
        },
        {
            flags: { importedEnergy: true, periodicEnergy: true },
            attributes: ImportedEnergyAndPeriodicEnergyAttributes
        },
        {
            flags: { exportedEnergy: true, periodicEnergy: true },
            attributes: ExportedEnergyAndPeriodicEnergyAttributes
        },
        { flags: { cumulativeEnergy: true }, attributes: CumulativeEnergyAttributes, events: CumulativeEnergyEvents },
        { flags: { periodicEnergy: true }, events: PeriodicEnergyEvents }
    ];

    export type Features = "ImportedEnergy" | "ExportedEnergy" | "CumulativeEnergy" | "PeriodicEnergy";

    /**
     * These are optional features supported by ElectricalEnergyMeasurementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.4
     */
    export enum Feature {
        /**
         * ImportedEnergy (IMPE)
         *
         * The feature indicates the server is capable of measuring how much energy is imported by the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.1
         */
        ImportedEnergy = "ImportedEnergy",

        /**
         * ExportedEnergy (EXPE)
         *
         * The feature indicates the server is capable of measuring how much energy is exported by the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.2
         */
        ExportedEnergy = "ExportedEnergy",

        /**
         * CumulativeEnergy (CUME)
         *
         * The feature indicates the server is capable of measuring how much energy has been imported or exported by the
         * server over the device’s lifetime. This measurement may start from when a device’s firmware is updated to
         * include this feature, when a device’s firmware is updated to correct measurement errors, or when a device is
         * factory reset.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.3
         */
        CumulativeEnergy = "CumulativeEnergy",

        /**
         * PeriodicEnergy (PERE)
         *
         * The feature indicates the server is capable of measuring how much energy has been imported or exported by the
         * server during a certain period of time. The start and end times for measurement periods shall be determined
         * by the server, and may represent overlapping periods.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.4
         */
        PeriodicEnergy = "PeriodicEnergy"
    }

    /**
     * This struct shall indicate the amount of energy measured during a given measurement period.
     *
     * A server which does not have the ability to determine the time in UTC, or has not yet done so, shall use the
     * system time fields to specify the measurement period and observation times.
     *
     * A server which has determined the time in UTC shall use the timestamp fields to specify the measurement period.
     * Such a server may also include the systime fields to indicate how many seconds had passed since boot for a given
     * timestamp; this allows for client-side resolution of UTC time for previous reports that only included systime.
     *
     * Elements using this data type shall indicate whether it represents cumulative or periodic energy, e.g. in the
     * name or in the element description.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.2
     */
    export interface EnergyMeasurement {
        /**
         * This field shall be the reported energy.
         *
         * If the EnergyMeasurementStruct represents cumulative energy, then this shall represent the cumulative energy
         * recorded at either the value of the EndTimestamp field or the value of the EndSystime field, or both.
         *
         * If the EnergyMeasurementStruct represents periodic energy, then this shall represent the energy recorded
         * during the period specified by either the StartTimestamp and EndTimestamp fields, the period specified by the
         * StartSystime and EndSystime fields, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.2.1
         */
        energy: number | bigint;

        /**
         * This field shall indicate the timestamp in UTC of the beginning of the period during which the value of the
         * Energy field was measured.
         *
         * If this EnergyMeasurementStruct represents cumulative energy, this field shall be omitted.
         *
         * Otherwise, if the server had determined the time in UTC at or before the beginning of the measurement period,
         * this field shall be indicated.
         *
         * Otherwise, if the server had not yet determined the time in UTC at or before the beginning of the measurement
         * period, or does not have the capability of determining the time in UTC, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.2.2
         */
        startTimestamp?: number;

        /**
         * This field shall indicate the timestamp in UTC of the end of the period during which the value of the Energy
         * field was measured.
         *
         * If the server had determined the time in UTC by the end of the measurement period, this field shall be
         * indicated.
         *
         * Otherwise, if the server had not yet determined the time in UTC by the end of the measurement period, or does
         * not have the capability of determining the time in UTC, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.2.3
         */
        endTimestamp?: number;

        /**
         * This field shall indicate the time elapsed since boot at the beginning of the period during which the value
         * of the Energy field was measured.
         *
         * If this EnergyMeasurementStruct represents cumulative energy, this field shall be omitted.
         *
         * Otherwise, if the server had not yet determined the time in UTC at the start of the measurement period, or
         * does not have the capability of determining the time in UTC, this field shall be indicated.
         *
         * Otherwise, if the server had determined the time in UTC at or before the beginning of the measurement period,
         * this field may be omitted; if it is indicated, its value shall be the time elapsed since boot at the UTC time
         * indicated in StartTimestamp.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.2.4
         */
        startSystime?: number | bigint;

        /**
         * This field shall indicate the time elapsed since boot at the end of the period during which the value of the
         * Energy field was measured.
         *
         * If the server had not yet determined the time in UTC by the end of the measurement period, or does not have
         * the capability of determining the time in UTC, this field shall be indicated.
         *
         * Otherwise, if the server had determined the time in UTC by the end of the measurement period, this field may
         * be omitted; if it is indicated, its value shall be the time elapsed since boot at the UTC time indicated in
         * EndTimestamp.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.2.5
         */
        endSystime?: number | bigint;
    }

    /**
     * This struct shall represent the times at which cumulative measurements were last zero, either due to
     * initialization of the device, or an internal reset of the cumulative value.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.3
     */
    export interface CumulativeEnergyReset {
        /**
         * This field shall indicate the timestamp in UTC when the value of the Energy field on the
         * CumulativeEnergyImported attribute was most recently zero.
         *
         * If the server had determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyImported attribute was most recently zero, this field shall be indicated.
         *
         * Otherwise, if the server had not yet determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyImported attribute was most recently zero, or does not have the capability of determining the
         * time in UTC, this field shall be omitted.
         *
         * If the timestamp in UTC when the value of the Energy field on the CumulativeEnergyImported attribute was most
         * recently zero cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.3.1
         */
        importedResetTimestamp?: number | null;

        /**
         * This field shall indicate the timestamp in UTC when the value of the Energy field on the
         * CumulativeEnergyExported attribute was most recently zero.
         *
         * If the server had determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyExported attribute was most recently zero, this field shall be indicated.
         *
         * Otherwise, if the server had not yet determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyExported attribute was most recently zero, or does not have the capability of determining the
         * time in UTC, this field shall be omitted.
         *
         * If the timestamp in UTC when the value of the Energy field on the CumulativeEnergyExported attribute was most
         * recently zero cannot currently be determined, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.3.2
         */
        exportedResetTimestamp?: number | null;

        /**
         * This field shall indicate the time elapsed since boot when the value of the Energy field on the
         * CumulativeEnergyImported attribute was most recently zero.
         *
         * If the server had not yet determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyImported attribute was most recently zero, or does not have the capability of determining the
         * time in UTC, this field shall be indicated.
         *
         * Otherwise, if the server had determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyImported attribute was most recently zero, this field may be omitted; if it is indicated, its
         * value shall be the time elapsed since boot at the UTC time indicated in ImportedResetTimestamp.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.3.3
         */
        importedResetSystime?: number | bigint | null;

        /**
         * This field shall indicate the time elapsed since boot when the value of the Energy field on the
         * CumulativeEnergyExported attribute was most recently zero.
         *
         * If the server had not yet determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyExported attribute was most recently zero, or does not have the capability of determining the
         * time in UTC, this field shall be indicated.
         *
         * Otherwise, if the server had determined the time in UTC when the value of the Energy field on the
         * CumulativeEnergyExported attribute was most recently zero, this field may be omitted; if it is indicated, its
         * value shall be the time elapsed since boot at the UTC time indicated in ImportedResetTimestamp.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.3.4
         */
        exportedResetSystime?: number | bigint | null;
    }

    /**
     * This event shall be generated when the server takes a snapshot of the cumulative energy imported by the server,
     * exported from the server, or both, but not more frequently than the rate mentioned in the description above of
     * the related attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1
     */
    export interface CumulativeEnergyMeasuredEvent {
        /**
         * This field shall be the value of CumulativeEnergyImported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1.1
         */
        energyImported?: EnergyMeasurement;

        /**
         * This field shall be the value of CumulativeEnergyExported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1.2
         */
        energyExported?: EnergyMeasurement;
    }

    /**
     * This event shall be generated when the server reaches the end of a reporting period for imported energy, exported
     * energy, or both.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2
     */
    export interface PeriodicEnergyMeasuredEvent {
        /**
         * This field shall be the value of PeriodicEnergyImported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2.1
         */
        energyImported?: EnergyMeasurement;

        /**
         * This field shall be the value of PeriodicEnergyExported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2.2
         */
        energyExported?: EnergyMeasurement;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.1
     */
    export enum MeasurementType {
        Unspecified = 0,

        /**
         * Voltage in millivolts (mV)
         */
        Voltage = 1,

        /**
         * Active current in milliamps (mA)
         */
        ActiveCurrent = 2,

        /**
         * Reactive current in milliamps (mA)
         */
        ReactiveCurrent = 3,

        /**
         * Apparent current in milliamps (mA)
         */
        ApparentCurrent = 4,

        /**
         * Active power in milliwatts (mW)
         */
        ActivePower = 5,

        /**
         * Reactive power in millivolt-amps reactive (mVAR)
         */
        ReactivePower = 6,

        /**
         * Apparent power in millivolt-amps (mVA)
         */
        ApparentPower = 7,

        /**
         * Root mean squared voltage in millivolts (mV)
         */
        RmsVoltage = 8,

        /**
         * Root mean squared current in milliamps (mA)
         */
        RmsCurrent = 9,

        /**
         * Root mean squared power in milliwatts (mW)
         */
        RmsPower = 10,

        /**
         * AC frequency in millihertz (mHz)
         */
        Frequency = 11,

        /**
         * Power Factor ratio in +/- 1/100ths of a percent.
         */
        PowerFactor = 12,

        /**
         * AC neutral current in milliamps (mA)
         */
        NeutralCurrent = 13,

        /**
         * Electrical energy in milliwatt-hours (mWh)
         */
        ElectricalEnergy = 14,

        /**
         * Reactive power in millivolt-amp-hours reactive (mVARh)
         */
        ReactiveEnergy = 15,

        /**
         * Apparent power in millivolt-amp-hours (mVAh)
         */
        ApparentEnergy = 16
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterNamespace.AttributeObjects<Attributes>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterNamespace.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use {@link ElectricalEnergyMeasurement}.
     */
    export const Cluster: typeof ElectricalEnergyMeasurement;

    /**
     * @deprecated Use {@link ElectricalEnergyMeasurement}.
     */
    export const Complete: typeof ElectricalEnergyMeasurement;

    export const Typing: ElectricalEnergyMeasurement;
}

/**
 * @deprecated Use {@link ElectricalEnergyMeasurement}.
 */
export declare const ElectricalEnergyMeasurementCluster: typeof ElectricalEnergyMeasurement;

export interface ElectricalEnergyMeasurement extends ClusterTyping {
    Attributes: ElectricalEnergyMeasurement.Attributes;
    Events: ElectricalEnergyMeasurement.Events;
    Features: ElectricalEnergyMeasurement.Features;
    Components: ElectricalEnergyMeasurement.Components;
}
