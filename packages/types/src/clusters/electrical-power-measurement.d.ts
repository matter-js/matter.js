/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MeasurementAccuracy } from "../globals/MeasurementAccuracy.js";

/**
 * Definitions for the ElectricalPowerMeasurement cluster.
 *
 * This cluster provides a mechanism for querying data about electrical power as measured by the server.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.13
 */
export declare namespace ElectricalPowerMeasurement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0090;

    /**
     * Textual cluster identifier.
     */
    export const name: "ElectricalPowerMeasurement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 3;

    /**
     * Canonical metadata for the ElectricalPowerMeasurement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ElectricalPowerMeasurement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This shall indicate the current mode of the server. For some servers, such as an EV, this may change
         * depending on the mode of charging or discharging.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.1
         */
        powerMode: PowerMode;

        /**
         * This shall indicate the maximum number of measurement types the server is capable of reporting.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.2
         */
        numberOfMeasurementTypes: number;

        /**
         * This shall indicate a list of accuracy specifications for the measurement types supported by the server.
         * There shall be an entry for ActivePower, as well as any other measurement types implemented by this server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.3
         */
        accuracy: MeasurementAccuracy[];

        /**
         * This shall indicate the most recent ActivePower reading in milliwatts (mW). If the power cannot be measured,
         * a value of null shall be returned.
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the Polyphase Power feature is set, this value represents the combined active power imported or exported.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.9
         */
        activePower: number | bigint | null;

        /**
         * This shall indicate a list of measured ranges for different measurement types. Each measurement type shall
         * have at most one entry in this list, representing the range of measurements in the most recent measurement
         * period.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.4
         */
        ranges?: MeasurementRange[];

        /**
         * This shall indicate the most recent Voltage reading in millivolts (mV).
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
         * If the voltage cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.5
         */
        voltage?: number | bigint | null;

        /**
         * This shall indicate the most recent ActiveCurrent reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the current cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.6
         */
        activeCurrent?: number | bigint | null;
    }

    /**
     * {@link ElectricalPowerMeasurement} supports these elements if it supports feature "AlternatingCurrent".
     */
    export interface AlternatingCurrentAttributes {
        /**
         * This shall indicate the most recent ReactiveCurrent reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the current cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.7
         */
        reactiveCurrent?: number | bigint | null;

        /**
         * This shall indicate the most recent ApparentCurrent (square root sum of the squares of active and reactive
         * currents) reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the active or reactive currents cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.8
         */
        apparentCurrent?: number | bigint | null;

        /**
         * This shall indicate the most recent ReactivePower reading in millivolt-amps reactive (mVAR).
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the reactive power cannot be measured, a value of null shall be returned.
         *
         * If the Polyphase Power feature is supported, this value represents the combined reactive power imported or
         * exported.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.10
         */
        reactivePower?: number | bigint | null;

        /**
         * This shall indicate the most recent ApparentPower reading in millivolt-amps (mVA).
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the apparent power cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.11
         */
        apparentPower?: number | bigint | null;

        /**
         * This shall indicate the most recent RMSVoltage reading in millivolts (mV).
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
         * If the RMS voltage cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.12
         */
        rmsVoltage?: number | bigint | null;

        /**
         * This shall indicate the most recent RMSCurrent reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the RMS current cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.13
         */
        rmsCurrent?: number | bigint | null;

        /**
         * This shall indicate the most recent RMSPower reading in milliwatts (mW).
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the RMS power cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.14
         */
        rmsPower?: number | bigint | null;

        /**
         * This shall indicate the most recent Frequency reading in millihertz (mHz).
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
         * If the frequency cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.15
         */
        frequency?: number | bigint | null;

        /**
         * This shall indicate the Power Factor ratio in +/- 1/100ths of a percent.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.18
         */
        powerFactor?: number | bigint | null;
    }

    /**
     * {@link ElectricalPowerMeasurement} supports these elements if it supports feature "Harmonics".
     */
    export interface HarmonicsAttributes {
        /**
         * This shall indicate a list of HarmonicMeasurementStruct values, with each HarmonicMeasurementStruct
         * representing the harmonic current reading for the harmonic order specified by Order.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.16
         */
        harmonicCurrents: HarmonicMeasurement[] | null;
    }

    /**
     * {@link ElectricalPowerMeasurement} supports these elements if it supports feature "PowerQuality".
     */
    export interface PowerQualityAttributes {
        /**
         * This shall indicate a list of HarmonicMeasurementStruct values, with each HarmonicMeasurementStruct
         * representing the most recent phase of the harmonic current reading for the harmonic order specified by Order.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.17
         */
        harmonicPhases: HarmonicMeasurement[] | null;
    }

    /**
     * {@link ElectricalPowerMeasurement} supports these elements if it supports feature "PolyphasePower".
     */
    export interface PolyphasePowerAttributes {
        /**
         * This shall indicate the most recent NeutralCurrent reading in milliamps (mA). Typically this is a derived
         * value, taking the magnitude of the vector sum of phase currents.
         *
         * If the neutral current cannot be measured or derived, a value of null shall be returned.
         *
         * A positive value represents an imbalance between the phase currents when power is imported.
         *
         * A negative value represents an imbalance between the phase currents when power is exported.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.19
         */
        neutralCurrent?: number | bigint | null;
    }

    /**
     * Attributes that may appear in {@link ElectricalPowerMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This shall indicate the current mode of the server. For some servers, such as an EV, this may change
         * depending on the mode of charging or discharging.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.1
         */
        powerMode: PowerMode;

        /**
         * This shall indicate the maximum number of measurement types the server is capable of reporting.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.2
         */
        numberOfMeasurementTypes: number;

        /**
         * This shall indicate a list of accuracy specifications for the measurement types supported by the server.
         * There shall be an entry for ActivePower, as well as any other measurement types implemented by this server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.3
         */
        accuracy: MeasurementAccuracy[];

        /**
         * This shall indicate the most recent ActivePower reading in milliwatts (mW). If the power cannot be measured,
         * a value of null shall be returned.
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the Polyphase Power feature is set, this value represents the combined active power imported or exported.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.9
         */
        activePower: number | bigint | null;

        /**
         * This shall indicate a list of measured ranges for different measurement types. Each measurement type shall
         * have at most one entry in this list, representing the range of measurements in the most recent measurement
         * period.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.4
         */
        ranges: MeasurementRange[];

        /**
         * This shall indicate the most recent Voltage reading in millivolts (mV).
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
         * If the voltage cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.5
         */
        voltage: number | bigint | null;

        /**
         * This shall indicate the most recent ActiveCurrent reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the current cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.6
         */
        activeCurrent: number | bigint | null;

        /**
         * This shall indicate the most recent ReactiveCurrent reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the current cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.7
         */
        reactiveCurrent: number | bigint | null;

        /**
         * This shall indicate the most recent ApparentCurrent (square root sum of the squares of active and reactive
         * currents) reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the active or reactive currents cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.8
         */
        apparentCurrent: number | bigint | null;

        /**
         * This shall indicate the most recent ReactivePower reading in millivolt-amps reactive (mVAR).
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the reactive power cannot be measured, a value of null shall be returned.
         *
         * If the Polyphase Power feature is supported, this value represents the combined reactive power imported or
         * exported.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.10
         */
        reactivePower: number | bigint | null;

        /**
         * This shall indicate the most recent ApparentPower reading in millivolt-amps (mVA).
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the apparent power cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.11
         */
        apparentPower: number | bigint | null;

        /**
         * This shall indicate the most recent RMSVoltage reading in millivolts (mV).
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
         * If the RMS voltage cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.12
         */
        rmsVoltage: number | bigint | null;

        /**
         * This shall indicate the most recent RMSCurrent reading in milliamps (mA).
         *
         * A positive value represents current flowing into the server, while a negative value represents current
         * flowing out of the server.
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
         * If the RMS current cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.13
         */
        rmsCurrent: number | bigint | null;

        /**
         * This shall indicate the most recent RMSPower reading in milliwatts (mW).
         *
         * A positive value represents power imported, while a negative value represents power exported.
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
         * If the RMS power cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.14
         */
        rmsPower: number | bigint | null;

        /**
         * This shall indicate the most recent Frequency reading in millihertz (mHz).
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
         * If the frequency cannot be measured, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.15
         */
        frequency: number | bigint | null;

        /**
         * This shall indicate the Power Factor ratio in +/- 1/100ths of a percent.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.18
         */
        powerFactor: number | bigint | null;

        /**
         * This shall indicate a list of HarmonicMeasurementStruct values, with each HarmonicMeasurementStruct
         * representing the harmonic current reading for the harmonic order specified by Order.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.16
         */
        harmonicCurrents: HarmonicMeasurement[] | null;

        /**
         * This shall indicate a list of HarmonicMeasurementStruct values, with each HarmonicMeasurementStruct
         * representing the most recent phase of the harmonic current reading for the harmonic order specified by Order.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.17
         */
        harmonicPhases: HarmonicMeasurement[] | null;

        /**
         * This shall indicate the most recent NeutralCurrent reading in milliamps (mA). Typically this is a derived
         * value, taking the magnitude of the vector sum of phase currents.
         *
         * If the neutral current cannot be measured or derived, a value of null shall be returned.
         *
         * A positive value represents an imbalance between the phase currents when power is imported.
         *
         * A negative value represents an imbalance between the phase currents when power is exported.
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.6.19
         */
        neutralCurrent: number | bigint | null;
    }

    /**
     * {@link ElectricalPowerMeasurement} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * If supported, this event shall be generated at the end of a measurement period. The start and end times for
         * measurement periods shall be determined by the server, and may represent overlapping periods.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.7.1
         */
        measurementPeriodRanges?: MeasurementPeriodRangesEvent;
    }

    /**
     * Events that may appear in {@link ElectricalPowerMeasurement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * If supported, this event shall be generated at the end of a measurement period. The start and end times for
         * measurement periods shall be determined by the server, and may represent overlapping periods.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.7.1
         */
        measurementPeriodRanges: MeasurementPeriodRangesEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, events: BaseEvents },
        { flags: { alternatingCurrent: true }, attributes: AlternatingCurrentAttributes },
        { flags: { harmonics: true }, attributes: HarmonicsAttributes },
        { flags: { powerQuality: true }, attributes: PowerQualityAttributes },
        { flags: { polyphasePower: true }, attributes: PolyphasePowerAttributes }
    ];

    export type Features = "DirectCurrent" | "AlternatingCurrent" | "PolyphasePower" | "Harmonics" | "PowerQuality";

    /**
     * These are optional features supported by ElectricalPowerMeasurementCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.13.4
     */
    export enum Feature {
        /**
         * DirectCurrent (DIRC)
         *
         * This feature indicates the cluster can measure a direct current.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.4.1
         */
        DirectCurrent = "DirectCurrent",

        /**
         * AlternatingCurrent (ALTC)
         *
         * This feature indicates the cluster can measure an alternating current.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.4.2
         */
        AlternatingCurrent = "AlternatingCurrent",

        /**
         * PolyphasePower (POLY)
         *
         * This feature indicates the cluster represents the collective measurements for a Polyphase power supply.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.4.3
         */
        PolyphasePower = "PolyphasePower",

        /**
         * Harmonics (HARM)
         *
         * This feature indicates the cluster can measure the harmonics of an alternating current.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.4.4
         */
        Harmonics = "Harmonics",

        /**
         * PowerQuality (PWRQ)
         *
         * This feature indicates the cluster can measure the harmonic phases of an alternating current.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.4.5
         */
        PowerQuality = "PowerQuality"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.1
     */
    export enum PowerMode {
        Unknown = 0,

        /**
         * Direct current
         */
        Dc = 1,

        /**
         * Alternating current, either single-phase or polyphase
         */
        Ac = 2
    }

    /**
     * This struct shall indicate the maximum and minimum values of a given measurement type during a measurement
     * period, along with the observation times of these values.
     *
     * A server which does not have the ability to determine the time in UTC, or has not yet done so, shall use the
     * system time fields to specify the measurement period and observation times.
     *
     * A server which has determined the time in UTC shall use the timestamp fields to specify the measurement period
     * and observation times. Such a server may also include the systime fields to indicate how many seconds had passed
     * since boot for a given timestamp; this allows for client-side resolution of UTC time for previous reports that
     * only included systime.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3
     */
    export declare class MeasurementRange {
        constructor(values?: Partial<MeasurementRange>);

        /**
         * This field shall be the type of measurement for the range provided.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.1
         */
        measurementType: MeasurementType;

        /**
         * This field shall be the smallest measured value for the associated measurement over either the period between
         * StartTimestamp and EndTimestamp, or the period between StartSystime and EndSystime, or both.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.2
         */
        min: number | bigint;

        /**
         * This field shall be the largest measured value for the associated measurement over the period between either
         * StartTimestamp and EndTimestamp or the period between StartSystime and EndSystime, or both.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.3
         */
        max: number | bigint;

        /**
         * This field shall be the timestamp in UTC of the beginning of the measurement period.
         *
         * If the server had not yet determined the time in UTC at or before the beginning of the measurement period, or
         * does not have the capability of determining the time in UTC, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.4
         */
        startTimestamp?: number;

        /**
         * This field shall be the timestamp in UTC of the end of the measurement period.
         *
         * If the server had not yet determined the time in UTC at or before the beginning of the measurement period, or
         * does not have the capability of determining the time in UTC, this field shall be omitted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.5
         */
        endTimestamp?: number;

        /**
         * This field shall be the most recent timestamp in UTC that the value in the Min field was measured.
         *
         * This field shall be greater than or equal to the value of the StartTimestamp field.
         *
         * This field shall be less than or equal to the value of the EndTimestamp field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.6
         */
        minTimestamp?: number;

        /**
         * This field shall be the most recent timestamp in UTC of the value in the Max field.
         *
         * This field shall be greater than or equal to the value of the StartTimestamp field.
         *
         * This field shall be less than or equal to the value of the EndTimestamp field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.7
         */
        maxTimestamp?: number;

        /**
         * This field shall be the time since boot of the beginning of the measurement period.
         *
         * If the server had determined the time in UTC at or before the start of the measurement period, this field may
         * be omitted along with the EndSystime, MinSystime, and MaxSystime fields.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.8
         */
        startSystime?: number | bigint;

        /**
         * This field shall be the time since boot of the end of the measurement period.
         *
         * If the server had determined the time in UTC at the end of the measurement period, this field may be omitted
         * along with the StartSystime field, MinSystime, and MaxSystime fields.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.9
         */
        endSystime?: number | bigint;

        /**
         * This field shall be the measurement time since boot of the value in the Min field was measured.
         *
         * This field shall be greater than or equal to the value of the StartSystime field.
         *
         * This field shall be less than or equal to the value of the EndSystime field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.10
         */
        minSystime?: number | bigint;

        /**
         * This field shall be the measurement time since boot of the value in the Max field.
         *
         * This field shall be greater than or equal to the value of the StartSystime field.
         *
         * This field shall be less than or equal to the value of the EndSystime field.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.3.11
         */
        maxSystime?: number | bigint;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.4
     */
    export declare class HarmonicMeasurement {
        constructor(values?: Partial<HarmonicMeasurement>);

        /**
         * This field shall be the order of the harmonic being measured. Typically this is an odd number, but servers
         * may choose to report even harmonics.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.4.1
         */
        order: number;

        /**
         * This field shall be the measured value for the given harmonic order.
         *
         * For the Harmonic Currents attribute, this value is the most recently measured harmonic current reading in
         * milliamps (mA). A positive value indicates that the measured harmonic current is positive, and a negative
         * value indicates that the measured harmonic current is negative.
         *
         * For the Harmonic Phases attribute, this value is the most recent phase of the given harmonic order in
         * millidegrees (mDeg). A positive value indicates that the measured phase is leading, and a negative value
         * indicates that the measured phase is lagging.
         *
         * If this measurement is not currently available, a value of null shall be returned.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.4.2
         */
        measurement: number | bigint | null;
    };

    /**
     * If supported, this event shall be generated at the end of a measurement period. The start and end times for
     * measurement periods shall be determined by the server, and may represent overlapping periods.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.13.7.1
     */
    export declare class MeasurementPeriodRangesEvent {
        constructor(values?: Partial<MeasurementPeriodRangesEvent>);

        /**
         * This shall indicate the value of the Ranges attribute at the time of event generation.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.13.7.1.1
         */
        ranges: MeasurementRange[];
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.13.5.2
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
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ElectricalPowerMeasurement}.
     */
    export const Cluster: typeof ElectricalPowerMeasurement;

    /**
     * @deprecated Use {@link ElectricalPowerMeasurement}.
     */
    export const Complete: typeof ElectricalPowerMeasurement;

    export const Typing: ElectricalPowerMeasurement;
}

/**
 * @deprecated Use {@link ElectricalPowerMeasurement}.
 */
export declare const ElectricalPowerMeasurementCluster: typeof ElectricalPowerMeasurement;

export interface ElectricalPowerMeasurement extends ClusterTyping {
    Attributes: ElectricalPowerMeasurement.Attributes;
    Events: ElectricalPowerMeasurement.Events;
    Features: ElectricalPowerMeasurement.Features;
    Components: ElectricalPowerMeasurement.Components;
}
