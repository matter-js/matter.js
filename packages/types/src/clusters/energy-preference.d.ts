/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the EnergyPreference cluster.
 *
 * This cluster provides an interface to specify preferences for how devices should consume energy.
 *
 * > [!NOTE]
 *
 * > Support for Energy Preference cluster is provisional.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 9.7
 */
export declare namespace EnergyPreference {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x009b;

    /**
     * Textual cluster identifier.
     */
    export const name: "EnergyPreference";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the EnergyPreference cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link EnergyPreference} supports these elements if it supports feature "EnergyBalance".
     */
    export interface EnergyBalanceAttributes {
        /**
         * Indicates a list of BalanceStructs, each representing a step along a linear scale of relative priorities. A
         * Step field with a value of zero shall indicate that the device SHOULD entirely favor the priority specified
         * by the first element in EnergyPriorities; whereas a Step field with a value of 100 shall indicate that the
         * device SHOULD entirely favor the priority specified by the second element in EnergyPriorities. The midpoint
         * value of 50 shall indicate an even split between the two priorities.
         *
         * This shall contain at least two BalanceStructs.
         *
         * Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct in the
         * list.
         *
         * The first BalanceStruct shall have a Step value of zero, and the last BalanceStruct shall have a Step value
         * of 100.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.1
         */
        energyBalances: Balance[];

        /**
         * Indicates the current preference of the user for balancing different priorities during device use. The value
         * of this attribute is the index, 0-based, into the EnergyBalances attribute for the currently selected
         * balance.
         *
         * If an attempt is made to set this attribute to an index outside the maximum index for EnergyBalances, a
         * response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If the value of EnergyBalances changes after an update, the device shall migrate the value of the
         * CurrentEnergyBalance attribute to the index which the manufacturer specifies most closely matches the
         * previous value, while preserving extreme preferences as follows:
         *
         *   1. If the previous value of CurrentEnergyBalance was zero, indicating a total preference for the priority
         *      specified by the first element in EnergyPriorities, the new value of CurrentEnergyBalance shall also be
         *      zero.
         *
         *   2. If the previous value of CurrentEnergyBalance was the index of the last BalanceStruct in the previous
         *      value of EnergyBalances, indicating a total preference for the priority specified by the last element in
         *      EnergyPriorities, the new value of CurrentEnergyBalance shall be the index of the last element in the
         *      updated value of EnergyBalances.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.2
         */
        currentEnergyBalance: number;

        /**
         * Indicates two extremes for interpreting the values in the EnergyBalances attribute. These two priorities
         * shall be in opposition to each other; e.g. Comfort vs. Efficiency or Speed vs. WaterConsumption.
         *
         * If the value of EnergyPriorities changes after an update to represent a new balance between priorities, the
         * value of the CurrentEnergyBalance attribute shall be set to its default.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.3
         */
        energyPriorities: EnergyPriority[];
    }

    /**
     * {@link EnergyPreference} supports these elements if it supports feature "LowPowerModeSensitivity".
     */
    export interface LowPowerModeSensitivityAttributes {
        /**
         * Indicates a list of BalanceStructs, each representing a condition or set of conditions for the device to
         * enter a low power mode.
         *
         * This shall contain at least two BalanceStructs.
         *
         * Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct in the
         * list.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.4
         */
        lowPowerModeSensitivities: Balance[];

        /**
         * Indicates the current preference of the user for determining when the device should enter a low power mode.
         * The value of this attribute is the index, 0-based, into the LowPowerModeSensitivities attribute for the
         * currently selected preference.
         *
         * If an attempt is made to set this attribute to an index outside the maximum index for
         * LowPowerModeSensitivities, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If the value of LowPowerModeSensitivities changes after an update, the device shall migrate the value of the
         * LowPowerModeSensitivity attribute to the index which the manufacturer specifies most closely matches the
         * previous value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.5
         */
        currentLowPowerModeSensitivity: number;
    }

    /**
     * Attributes that may appear in {@link EnergyPreference}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a list of BalanceStructs, each representing a step along a linear scale of relative priorities. A
         * Step field with a value of zero shall indicate that the device SHOULD entirely favor the priority specified
         * by the first element in EnergyPriorities; whereas a Step field with a value of 100 shall indicate that the
         * device SHOULD entirely favor the priority specified by the second element in EnergyPriorities. The midpoint
         * value of 50 shall indicate an even split between the two priorities.
         *
         * This shall contain at least two BalanceStructs.
         *
         * Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct in the
         * list.
         *
         * The first BalanceStruct shall have a Step value of zero, and the last BalanceStruct shall have a Step value
         * of 100.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.1
         */
        energyBalances: Balance[];

        /**
         * Indicates the current preference of the user for balancing different priorities during device use. The value
         * of this attribute is the index, 0-based, into the EnergyBalances attribute for the currently selected
         * balance.
         *
         * If an attempt is made to set this attribute to an index outside the maximum index for EnergyBalances, a
         * response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If the value of EnergyBalances changes after an update, the device shall migrate the value of the
         * CurrentEnergyBalance attribute to the index which the manufacturer specifies most closely matches the
         * previous value, while preserving extreme preferences as follows:
         *
         *   1. If the previous value of CurrentEnergyBalance was zero, indicating a total preference for the priority
         *      specified by the first element in EnergyPriorities, the new value of CurrentEnergyBalance shall also be
         *      zero.
         *
         *   2. If the previous value of CurrentEnergyBalance was the index of the last BalanceStruct in the previous
         *      value of EnergyBalances, indicating a total preference for the priority specified by the last element in
         *      EnergyPriorities, the new value of CurrentEnergyBalance shall be the index of the last element in the
         *      updated value of EnergyBalances.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.2
         */
        currentEnergyBalance: number;

        /**
         * Indicates two extremes for interpreting the values in the EnergyBalances attribute. These two priorities
         * shall be in opposition to each other; e.g. Comfort vs. Efficiency or Speed vs. WaterConsumption.
         *
         * If the value of EnergyPriorities changes after an update to represent a new balance between priorities, the
         * value of the CurrentEnergyBalance attribute shall be set to its default.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.3
         */
        energyPriorities: EnergyPriority[];

        /**
         * Indicates a list of BalanceStructs, each representing a condition or set of conditions for the device to
         * enter a low power mode.
         *
         * This shall contain at least two BalanceStructs.
         *
         * Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct in the
         * list.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.4
         */
        lowPowerModeSensitivities: Balance[];

        /**
         * Indicates the current preference of the user for determining when the device should enter a low power mode.
         * The value of this attribute is the index, 0-based, into the LowPowerModeSensitivities attribute for the
         * currently selected preference.
         *
         * If an attempt is made to set this attribute to an index outside the maximum index for
         * LowPowerModeSensitivities, a response with the status code CONSTRAINT_ERROR shall be returned.
         *
         * If the value of LowPowerModeSensitivities changes after an update, the device shall migrate the value of the
         * LowPowerModeSensitivity attribute to the index which the manufacturer specifies most closely matches the
         * previous value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.5
         */
        currentLowPowerModeSensitivity: number;
    }

    export type Components = [
        { flags: { energyBalance: true }, attributes: EnergyBalanceAttributes },
        { flags: { lowPowerModeSensitivity: true }, attributes: LowPowerModeSensitivityAttributes }
    ];
    export type Features = "EnergyBalance" | "LowPowerModeSensitivity";

    /**
     * These are optional features supported by EnergyPreferenceCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.7.4
     */
    export enum Feature {
        /**
         * EnergyBalance (BALA)
         *
         * This feature allows a user to select from a list of energy balances with associated descriptions of which
         * strategies a device will use to target the specified balance.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.4.1
         */
        EnergyBalance = "EnergyBalance",

        /**
         * LowPowerModeSensitivity (LPMS)
         *
         * This feature allows the user to select a condition or set of conditions which will cause the device to switch
         * to a mode using less power. For example, a device might provide a scale of durations that must elapse without
         * user interaction before it goes to sleep.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.4.2
         */
        LowPowerModeSensitivity = "LowPowerModeSensitivity"
    }

    /**
     * This represents a step along a scale of preferences.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.2
     */
    export interface Balance {
        /**
         * This field shall indicate the relative value of this step.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.2.1
         */
        step: number;

        /**
         * This field shall indicate an optional string explaining which actions a device might take at the given step
         * value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.2.2
         */
        label?: string;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.1
     */
    export enum EnergyPriority {
        /**
         * User comfort
         *
         * This value shall emphasize user comfort; e.g. local temperature for a thermostat.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.1.1
         */
        Comfort = 0,

        /**
         * Speed of operation
         *
         * This value shall emphasize how quickly a device accomplishes its targeted use; e.g. how quickly a robot
         * vacuum completes a cleaning cycle.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.1.2
         */
        Speed = 1,

        /**
         * Amount of Energy consumed by the device
         *
         * This value shall emphasize how much energy a device uses; e.g. electricity usage for a Pump.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.1.3
         */
        Efficiency = 2,

        /**
         * Amount of water consumed by the device
         */
        WaterConsumption = 3
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
     * @deprecated Use {@link EnergyPreference}.
     */
    export const Cluster: typeof EnergyPreference;

    /**
     * @deprecated Use {@link EnergyPreference}.
     */
    export const Complete: typeof EnergyPreference;

    export const Typing: EnergyPreference;
}

/**
 * @deprecated Use {@link EnergyPreference}.
 */
export declare const EnergyPreferenceCluster: typeof EnergyPreference;

export interface EnergyPreference extends ClusterTyping {
    Attributes: EnergyPreference.Attributes;
    Features: EnergyPreference.Features;
    Components: EnergyPreference.Components;
}
