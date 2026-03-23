/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute, Event, FixedAttribute } from "../cluster/Cluster.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvInt64, TlvEpochS, TlvSysTimeMS } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { Priority } from "../globals/Priority.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvMeasurementAccuracy, MeasurementAccuracy } from "../globals/MeasurementAccuracy.js";
import { Identity } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ElectricalEnergyMeasurement as ElectricalEnergyMeasurementModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ElectricalEnergyMeasurement cluster.
 */
export namespace ElectricalEnergyMeasurement {
    /**
     * {@link ElectricalEnergyMeasurement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the accuracy of energy measurement by this server. The value of the MeasurementType field on
             * this MeasurementAccuracyStruct shall be ElectricalEnergy.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.1
             */
            readonly accuracy: MeasurementAccuracy;
        }
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ImportedEnergyAndCumulativeEnergy".
     */
    export namespace ImportedEnergyAndCumulativeEnergyComponent {
        export interface Attributes {
            /**
             * Indicates the most recent measurement of cumulative energy imported by the server over the lifetime of
             * the device, and the timestamp of when the measurement was recorded.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the cumulative energy imported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.2
             */
            readonly cumulativeEnergyImported: EnergyMeasurement | null;
        }
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ExportedEnergyAndCumulativeEnergy".
     */
    export namespace ExportedEnergyAndCumulativeEnergyComponent {
        export interface Attributes {
            /**
             * Indicates the most recent measurement of cumulative energy exported by the server over the lifetime of
             * the device, and the timestamp of when the measurement was recorded.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the cumulative energy exported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.3
             */
            readonly cumulativeEnergyExported: EnergyMeasurement | null;
        }
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ImportedEnergyAndPeriodicEnergy".
     */
    export namespace ImportedEnergyAndPeriodicEnergyComponent {
        export interface Attributes {
            /**
             * Indicates the most recent measurement of energy imported by the server and the period during which it was
             * measured.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the periodic energy imported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.4
             */
            readonly periodicEnergyImported: EnergyMeasurement | null;
        }
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature
     * "ExportedEnergyAndPeriodicEnergy".
     */
    export namespace ExportedEnergyAndPeriodicEnergyComponent {
        export interface Attributes {
            /**
             * Indicates the most recent measurement of energy exported by the server and the period during which it was
             * measured.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the periodic energy exported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.5
             */
            readonly periodicEnergyExported: EnergyMeasurement | null;
        }
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature "CumulativeEnergy".
     */
    export namespace CumulativeEnergyComponent {
        export interface Attributes {
            /**
             * Indicates when cumulative measurements were most recently zero.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.6
             */
            readonly cumulativeEnergyReset?: CumulativeEnergyReset | null;
        }

        export interface Events {
            /**
             * This event shall be generated when the server takes a snapshot of the cumulative energy imported by the
             * server, exported from the server, or both, but not more frequently than the rate mentioned in the
             * description above of the related attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1
             */
            cumulativeEnergyMeasured: CumulativeEnergyMeasuredEvent;
        }
    }

    /**
     * {@link ElectricalEnergyMeasurement} supports these elements if it supports feature "PeriodicEnergy".
     */
    export namespace PeriodicEnergyComponent {
        export interface Events {
            /**
             * This event shall be generated when the server reaches the end of a reporting period for imported energy,
             * exported energy, or both.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2
             */
            periodicEnergyMeasured: PeriodicEnergyMeasuredEvent;
        }
    }

    /**
     * Attributes that may appear in {@link ElectricalEnergyMeasurement}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the accuracy of energy measurement by this server. The value of the MeasurementType field on this
         * MeasurementAccuracyStruct shall be ElectricalEnergy.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.1
         */
        readonly accuracy: MeasurementAccuracy;

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
        readonly cumulativeEnergyImported: EnergyMeasurement | null;

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
        readonly cumulativeEnergyExported: EnergyMeasurement | null;

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
        readonly periodicEnergyImported: EnergyMeasurement | null;

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
        readonly periodicEnergyExported: EnergyMeasurement | null;

        /**
         * Indicates when cumulative measurements were most recently zero.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.6
         */
        readonly cumulativeEnergyReset: CumulativeEnergyReset | null;
    }

    /**
     * Events that may appear in {@link ElectricalEnergyMeasurement}.
     *
     * Device support for events may be affected by a device's supported {@link Features}.
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
        { flags: {}, attributes: Base.Attributes },
        {
            flags: { importedEnergy: true, cumulativeEnergy: true },
            attributes: ImportedEnergyAndCumulativeEnergyComponent.Attributes
        },
        {
            flags: { exportedEnergy: true, cumulativeEnergy: true },
            attributes: ExportedEnergyAndCumulativeEnergyComponent.Attributes
        },
        {
            flags: { importedEnergy: true, periodicEnergy: true },
            attributes: ImportedEnergyAndPeriodicEnergyComponent.Attributes
        },
        {
            flags: { exportedEnergy: true, periodicEnergy: true },
            attributes: ExportedEnergyAndPeriodicEnergyComponent.Attributes
        },
        {
            flags: { cumulativeEnergy: true },
            attributes: CumulativeEnergyComponent.Attributes,
            events: CumulativeEnergyComponent.Events
        },
        { flags: { periodicEnergy: true }, events: PeriodicEnergyComponent.Events }
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
    export const TlvEnergyMeasurement = TlvObject({
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
        energy: TlvField(0, TlvInt64.bound({ min: 0 })),

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
        startTimestamp: TlvOptionalField(1, TlvEpochS),

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
        endTimestamp: TlvOptionalField(2, TlvEpochS),

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
        startSystime: TlvOptionalField(3, TlvSysTimeMS),

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
        endSystime: TlvOptionalField(4, TlvSysTimeMS)
    });

    /**
     * This struct shall represent the times at which cumulative measurements were last zero, either due to
     * initialization of the device, or an internal reset of the cumulative value.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.5.3
     */
    export const TlvCumulativeEnergyReset = TlvObject({
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
        importedResetTimestamp: TlvOptionalField(0, TlvNullable(TlvEpochS)),

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
        exportedResetTimestamp: TlvOptionalField(1, TlvNullable(TlvEpochS)),

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
        importedResetSystime: TlvOptionalField(2, TlvNullable(TlvSysTimeMS)),

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
        exportedResetSystime: TlvOptionalField(3, TlvNullable(TlvSysTimeMS))
    });

    /**
     * Body of the ElectricalEnergyMeasurement cumulativeEnergyMeasured event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1
     */
    export const TlvCumulativeEnergyMeasuredEvent = TlvObject({
        /**
         * This field shall be the value of CumulativeEnergyImported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1.1
         */
        energyImported: TlvOptionalField(0, TlvEnergyMeasurement),

        /**
         * This field shall be the value of CumulativeEnergyExported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1.2
         */
        energyExported: TlvOptionalField(1, TlvEnergyMeasurement)
    });

    /**
     * Body of the ElectricalEnergyMeasurement periodicEnergyMeasured event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2
     */
    export const TlvPeriodicEnergyMeasuredEvent = TlvObject({
        /**
         * This field shall be the value of PeriodicEnergyImported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2.1
         */
        energyImported: TlvOptionalField(0, TlvEnergyMeasurement),

        /**
         * This field shall be the value of PeriodicEnergyExported attribute at the timestamp indicated in its
         * EndTimestamp field, EndSystime field, or both.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2.2
         */
        energyExported: TlvOptionalField(1, TlvEnergyMeasurement)
    });

    /**
     * A ElectricalEnergyMeasurementCluster supports these elements if it supports features ImportedEnergy and
     * CumulativeEnergy.
     */
    export const ImportedEnergyAndCumulativeEnergyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the most recent measurement of cumulative energy imported by the server over the lifetime of
             * the device, and the timestamp of when the measurement was recorded.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the cumulative energy imported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.2
             */
            cumulativeEnergyImported: Attribute(0x1, TlvNullable(TlvEnergyMeasurement))
        }
    });

    /**
     * A ElectricalEnergyMeasurementCluster supports these elements if it supports features ExportedEnergy and
     * CumulativeEnergy.
     */
    export const ExportedEnergyAndCumulativeEnergyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the most recent measurement of cumulative energy exported by the server over the lifetime of
             * the device, and the timestamp of when the measurement was recorded.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the cumulative energy exported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.3
             */
            cumulativeEnergyExported: Attribute(0x2, TlvNullable(TlvEnergyMeasurement))
        }
    });

    /**
     * A ElectricalEnergyMeasurementCluster supports these elements if it supports features ImportedEnergy and
     * PeriodicEnergy.
     */
    export const ImportedEnergyAndPeriodicEnergyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the most recent measurement of energy imported by the server and the period during which it was
             * measured.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the periodic energy imported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.4
             */
            periodicEnergyImported: Attribute(0x3, TlvNullable(TlvEnergyMeasurement))
        }
    });

    /**
     * A ElectricalEnergyMeasurementCluster supports these elements if it supports features ExportedEnergy and
     * PeriodicEnergy.
     */
    export const ExportedEnergyAndPeriodicEnergyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the most recent measurement of energy exported by the server and the period during which it was
             * measured.
             *
             * The reporting interval of this attribute shall be manufacturer dependent. The server may choose to omit
             * publication of deltas considered not meaningful.
             *
             * The server shall NOT mark this attribute ready for report if the last time this was done was more
             * recently than 1 second ago.
             *
             * The server may delay marking this attribute ready for report for longer periods if needed, however the
             * server shall NOT delay marking this attribute as ready for report for longer than 60 seconds.
             *
             * If the periodic energy exported cannot currently be determined, a value of null shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.5
             */
            periodicEnergyExported: Attribute(0x4, TlvNullable(TlvEnergyMeasurement))
        }
    });

    /**
     * A ElectricalEnergyMeasurementCluster supports these elements if it supports feature CumulativeEnergy.
     */
    export const CumulativeEnergyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates when cumulative measurements were most recently zero.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.6
             */
            cumulativeEnergyReset: OptionalAttribute(0x5, TlvNullable(TlvCumulativeEnergyReset), { default: null })
        },

        events: {
            /**
             * This event shall be generated when the server takes a snapshot of the cumulative energy imported by the
             * server, exported from the server, or both, but not more frequently than the rate mentioned in the
             * description above of the related attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.1
             */
            cumulativeEnergyMeasured: Event(0x0, Priority.Info, TlvCumulativeEnergyMeasuredEvent)
        }
    });

    /**
     * A ElectricalEnergyMeasurementCluster supports these elements if it supports feature PeriodicEnergy.
     */
    export const PeriodicEnergyComponent = MutableCluster.Component({
        events: {
            /**
             * This event shall be generated when the server reaches the end of a reporting period for imported energy,
             * exported energy, or both.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.7.2
             */
            periodicEnergyMeasured: Event(0x1, Priority.Info, TlvPeriodicEnergyMeasuredEvent)
        }
    });

    /**
     * These elements and properties are present in all ElectricalEnergyMeasurement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x91,
        name: "ElectricalEnergyMeasurement",
        revision: 1,

        features: {
            /**
             * The feature indicates the server is capable of measuring how much energy is imported by the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.1
             */
            importedEnergy: BitFlag(0),

            /**
             * The feature indicates the server is capable of measuring how much energy is exported by the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.2
             */
            exportedEnergy: BitFlag(1),

            /**
             * The feature indicates the server is capable of measuring how much energy has been imported or exported by
             * the server over the device’s lifetime. This measurement may start from when a device’s firmware is
             * updated to include this feature, when a device’s firmware is updated to correct measurement errors, or
             * when a device is factory reset.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.3
             */
            cumulativeEnergy: BitFlag(2),

            /**
             * The feature indicates the server is capable of measuring how much energy has been imported or exported by
             * the server during a certain period of time. The start and end times for measurement periods shall be
             * determined by the server, and may represent overlapping periods.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.4.4
             */
            periodicEnergy: BitFlag(3)
        },

        attributes: {
            /**
             * Indicates the accuracy of energy measurement by this server. The value of the MeasurementType field on
             * this MeasurementAccuracyStruct shall be ElectricalEnergy.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.12.6.1
             */
            accuracy: FixedAttribute(0x0, TlvMeasurementAccuracy)
        },

        /**
         * This metadata controls which ElectricalEnergyMeasurementCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            {
                flags: { importedEnergy: true, cumulativeEnergy: true },
                component: ImportedEnergyAndCumulativeEnergyComponent
            },
            {
                flags: { exportedEnergy: true, cumulativeEnergy: true },
                component: ExportedEnergyAndCumulativeEnergyComponent
            },
            {
                flags: { importedEnergy: true, periodicEnergy: true },
                component: ImportedEnergyAndPeriodicEnergyComponent
            },
            {
                flags: { exportedEnergy: true, periodicEnergy: true },
                component: ExportedEnergyAndPeriodicEnergyComponent
            },
            { flags: { cumulativeEnergy: true }, component: CumulativeEnergyComponent },
            { flags: { periodicEnergy: true }, component: PeriodicEnergyComponent },
            { flags: { importedEnergy: false, exportedEnergy: false }, component: false },
            { flags: { cumulativeEnergy: false, periodicEnergy: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides a mechanism for querying data about the electrical energy imported or provided by the
     * server.
     *
     * Per the Matter specification you cannot use {@link ElectricalEnergyMeasurementCluster} without enabling certain
     * feature combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.12
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ElectricalEnergyMeasurement` instead of
     * `ElectricalEnergyMeasurement.Complete`)
     */
    export type Complete = typeof ElectricalEnergyMeasurement;

    export declare const Complete: Complete;
    export const id = ClusterId(0x91);
    export const name = "ElectricalEnergyMeasurement" as const;
    export const revision = 1;
    export const schema = ElectricalEnergyMeasurementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: ElectricalEnergyMeasurement;
}

export type ElectricalEnergyMeasurementCluster = ElectricalEnergyMeasurement.Cluster;
export const ElectricalEnergyMeasurementCluster = ElectricalEnergyMeasurement.Cluster;
ClusterNamespace.define(ElectricalEnergyMeasurement);
export interface ElectricalEnergyMeasurement extends ClusterTyping { Attributes: ElectricalEnergyMeasurement.Attributes; Events: ElectricalEnergyMeasurement.Events; Features: ElectricalEnergyMeasurement.Features; Components: ElectricalEnergyMeasurement.Components }
