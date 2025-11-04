/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, WritableAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvPercent, TlvUInt8, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace EnergyPreference {
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
    export const TlvBalance = TlvObject({
        /**
         * This field shall indicate the relative value of this step.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.2.1
         */
        step: TlvField(0, TlvPercent),

        /**
         * This field shall indicate an optional string explaining which actions a device might take at the given step
         * value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.2.2
         */
        label: TlvOptionalField(1, TlvString.bound({ maxLength: 64 }))
    });

    /**
     * This represents a step along a scale of preferences.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.7.5.2
     */
    export interface Balance extends TypeFromSchema<typeof TlvBalance> {}

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
     * A EnergyPreferenceCluster supports these elements if it supports feature EnergyBalance.
     */
    export const EnergyBalanceComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates a list of BalanceStructs, each representing a step along a linear scale of relative priorities.
             * A Step field with a value of zero shall indicate that the device SHOULD entirely favor the priority
             * specified by the first element in EnergyPriorities; whereas a Step field with a value of 100 shall
             * indicate that the device SHOULD entirely favor the priority specified by the second element in
             * EnergyPriorities. The midpoint value of 50 shall indicate an even split between the two priorities.
             *
             * This shall contain at least two BalanceStructs.
             *
             * Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct in
             * the list.
             *
             * The first BalanceStruct shall have a Step value of zero, and the last BalanceStruct shall have a Step
             * value of 100.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.1
             */
            energyBalances: FixedAttribute(0x0, TlvArray(TlvBalance, { minLength: 2, maxLength: 10 })),

            /**
             * Indicates the current preference of the user for balancing different priorities during device use. The
             * value of this attribute is the index, 0-based, into the EnergyBalances attribute for the currently
             * selected balance.
             *
             * If an attempt is made to set this attribute to an index outside the maximum index for EnergyBalances, a
             * response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * If the value of EnergyBalances changes after an update, the device shall migrate the value of the
             * CurrentEnergyBalance attribute to the index which the manufacturer specifies most closely matches the
             * previous value, while preserving extreme preferences as follows:
             *
             *   1. If the previous value of CurrentEnergyBalance was zero, indicating a total preference for the
             *      priority specified by the first element in EnergyPriorities, the new value of CurrentEnergyBalance
             *      shall also be zero.
             *
             *   2. If the previous value of CurrentEnergyBalance was the index of the last BalanceStruct in the
             *      previous value of EnergyBalances, indicating a total preference for the priority specified by the
             *      last element in EnergyPriorities, the new value of CurrentEnergyBalance shall be the index of the
             *      last element in the updated value of EnergyBalances.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.2
             */
            currentEnergyBalance: WritableAttribute(0x1, TlvUInt8, { persistent: true }),

            /**
             * Indicates two extremes for interpreting the values in the EnergyBalances attribute. These two priorities
             * shall be in opposition to each other; e.g. Comfort vs. Efficiency or Speed vs. WaterConsumption.
             *
             * If the value of EnergyPriorities changes after an update to represent a new balance between priorities,
             * the value of the CurrentEnergyBalance attribute shall be set to its default.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.3
             */
            energyPriorities: FixedAttribute(0x2, TlvArray(TlvEnum<EnergyPriority>(), { length: 2 }))
        }
    });

    /**
     * A EnergyPreferenceCluster supports these elements if it supports feature LowPowerModeSensitivity.
     */
    export const LowPowerModeSensitivityComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates a list of BalanceStructs, each representing a condition or set of conditions for the device to
             * enter a low power mode. This shall contain at least two BalanceStructs.
             *
             * Each BalanceStruct shall have a Step field larger than the Step field on the previous BalanceStruct in
             * the list.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.4
             */
            lowPowerModeSensitivities: FixedAttribute(0x3, TlvArray(TlvBalance, { minLength: 2, maxLength: 10 })),

            /**
             * Indicates the current preference of the user for determining when the device should enter a low power
             * mode. The value of this attribute is the index, 0-based, into the LowPowerModeSensitivities attribute for
             * the currently selected preference.
             *
             * If an attempt is made to set this attribute to an index outside the maximum index for
             * LowPowerModeSensitivities, a response with the status code CONSTRAINT_ERROR shall be returned.
             *
             * If the value of LowPowerModeSensitivities changes after an update, the device shall migrate the value of
             * the LowPowerModeSensitivity attribute to the index which the manufacturer specifies most closely matches
             * the previous value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.6.5
             */
            currentLowPowerModeSensitivity: WritableAttribute(0x4, TlvUInt8, { persistent: true })
        }
    });

    /**
     * These elements and properties are present in all EnergyPreference clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x9b,
        name: "EnergyPreference",
        revision: 1,

        features: {
            /**
             * This feature allows a user to select from a list of energy balances with associated descriptions of which
             * strategies a device will use to target the specified balance.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.4.1
             */
            energyBalance: BitFlag(0),

            /**
             * This feature allows the user to select a condition or set of conditions which will cause the device to
             * switch to a mode using less power. For example, a device might provide a scale of durations that must
             * elapse without user interaction before it goes to sleep.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.7.4.2
             */
            lowPowerModeSensitivity: BitFlag(1)
        },

        /**
         * This metadata controls which EnergyPreferenceCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { energyBalance: true }, component: EnergyBalanceComponent },
            { flags: { lowPowerModeSensitivity: true }, component: LowPowerModeSensitivityComponent },
            { flags: { energyBalance: false, lowPowerModeSensitivity: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides an interface to specify preferences for how devices should consume energy.
     *
     * NOTE Support for Energy Preference cluster is provisional.
     *
     * Per the Matter specification you cannot use {@link EnergyPreferenceCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const BALA = { energyBalance: true };
    const LPMS = { lowPowerModeSensitivity: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            energyBalances: MutableCluster.AsConditional(
                EnergyBalanceComponent.attributes.energyBalances,
                { mandatoryIf: [BALA] }
            ),
            currentEnergyBalance: MutableCluster.AsConditional(
                EnergyBalanceComponent.attributes.currentEnergyBalance,
                { mandatoryIf: [BALA] }
            ),
            energyPriorities: MutableCluster.AsConditional(
                EnergyBalanceComponent.attributes.energyPriorities,
                { mandatoryIf: [BALA] }
            ),
            lowPowerModeSensitivities: MutableCluster.AsConditional(
                LowPowerModeSensitivityComponent.attributes.lowPowerModeSensitivities,
                { mandatoryIf: [LPMS] }
            ),
            currentLowPowerModeSensitivity: MutableCluster.AsConditional(
                LowPowerModeSensitivityComponent.attributes.currentLowPowerModeSensitivity,
                { mandatoryIf: [LPMS] }
            )
        }
    });

    /**
     * This cluster supports all EnergyPreference features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type EnergyPreferenceCluster = EnergyPreference.Cluster;
export const EnergyPreferenceCluster = EnergyPreference.Cluster;
ClusterRegistry.register(EnergyPreference.Complete);
