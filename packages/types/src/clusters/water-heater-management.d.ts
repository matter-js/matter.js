/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { WaterHeaterManagement as WaterHeaterManagementModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the WaterHeaterManagement cluster.
 */
export declare namespace WaterHeaterManagement {
    /**
     * {@link WaterHeaterManagement} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the heat sources that the water heater can call on for heating. If a bit is set then the water
             * heater supports the corresponding heat source.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.7.1
             */
            readonly heaterTypes: WaterHeaterHeatSource;

            /**
             * Indicates if the water heater is heating water. If a bit is set then the corresponding heat source is
             * active.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.7.2
             */
            readonly heatDemand: WaterHeaterHeatSource;

            /**
             * Indicates whether the Boost, as triggered by a Boost command, is currently Active or Inactive.
             *
             * See Section 9.5.8.1, “Boost Command” and Section 9.5.8.2, “CancelBoost Command” for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.7.6
             */
            readonly boostState: BoostState;
        }

        export interface Commands {
            /**
             * Allows a client to request that the water heater is put into a Boost state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.8.1
             */
            boost(request: BoostRequest): MaybePromise;

            /**
             * Allows a client to cancel an ongoing Boost operation.
             *
             * This command has no payload.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.8.2
             */
            cancelBoost(): MaybePromise;
        }

        export interface Events {
            /**
             * This event shall be generated whenever a Boost command is accepted.
             *
             * The corresponding structure fields within the WaterHeaterBoostInfoStruct are copied from the Boost
             * command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.9.1
             */
            boostStarted: BoostStartedEvent;

            /**
             * This event shall be generated whenever the BoostState transitions from Active to Inactive.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.9.2
             */
            boostEnded: void;
        }
    }

    /**
     * {@link WaterHeaterManagement} supports these elements if it supports feature "EnergyManagement".
     */
    export namespace EnergyManagementComponent {
        export interface Attributes {
            /**
             * Indicates the volume of water that the hot water tank can hold (in units of Litres). This allows an
             * energy management system to estimate the required heating energy needed to reach the target temperature.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.7.3
             */
            readonly tankVolume: number;

            /**
             * Indicates the estimated heat energy needed to raise the water temperature to the target setpoint. This
             * can be computed by taking the specific heat capacity of water (4182 J/kg °C) and by knowing the current
             * temperature of the water, the tank volume and target temperature.
             *
             * For example, if the target temperature was 60°C, the current temperature was 20°C and the tank volume was
             * 100L:
             *
             * Mass of water = 1kg per Litre Total Mass = 100 x 1kg = 100kg Δ Temperature = (target temperature -
             * current temperature) = (60°C - 20°C) = 40°C
             *
             * Energy required to heat the water to 60°C = 4182 x 40 x 100 = 16,728,000 J
             *
             * Converting Joules in to Wh of heat (divide by 3600): = 16,728,000 J / 3600 = 4647 Wh (4.65kWh)
             *
             * If the TankPercent feature is supported, then this estimate shall also take into account the percentage
             * of the water in the tank which is already hot.
             *
             * > [!NOTE]
             *
             * > The electrical energy required to heat the water depends on the heating system used to heat the water.
             *   For example, a direct electric immersion heating element can be close to 100% efficient, so the
             *   electrical energy needed to heat the hot water is nearly the same as the EstimatedHeatEnergyRequired.
             *   However some forms of heating, such as an air-source heat pump which extracts heat from ambient air,
             *   requires much less electrical energy to heat hot water. Heat pumps can be produce 3kWh of heat output
             *   for 1kWh of electrical energy input. The conversion between heat energy and electrical energy is
             *   outside the scope of this cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.7.4
             */
            readonly estimatedHeatRequired: number | bigint;
        }
    }

    /**
     * {@link WaterHeaterManagement} supports these elements if it supports feature "TankPercent".
     */
    export namespace TankPercentComponent {
        export interface Attributes {
            /**
             * Indicates an approximate level of hot water stored in the tank, which might help consumers understand the
             * amount of hot water remaining in the tank. The accuracy of this attribute is manufacturer specific.
             *
             * In most hot water tanks, there is a stratification effect where the hot water layer rests above a cooler
             * layer of water below. For this reason cold water is fed in at the bottom of the tank and the hot water is
             * drawn from the top.
             *
             * Some water tanks might use multiple temperature probes to estimate the level of the hot water layer. A
             * water heater with multiple temperature probes is likely to implement an algorithm to estimate the hot
             * water tank percentage by taking into account the temperature values of each probe to determine the height
             * of the hot water.
             *
             * However it might be possible with a single temperature probe to estimate how much hot water is left using
             * a simpler algorithm:
             *
             * For example, if the target temperature was 60°C, the CurrentTemperature was 40°C from a single
             * temperature probe measuring the average water temperature and the temperature of incoming cold water
             * (COLD_WATER_TEMP) was assumed to be 20°C:
             *
             * TankPercentage = int(((current temperature - COLD_WATER_TEMP) / (target temperature - COLD_WATER_TEMP)) *
             * 100) TankPercentage = min( max(TankPercentage,0), 100)
             *
             * TankPercentage = 50%
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.5.7.5
             */
            readonly tankPercentage: number;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<EnergyManagementComponent.Attributes>, Partial<TankPercentComponent.Attributes> {}
    export interface Commands extends Base.Commands {}
    export interface Events extends Base.Events {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands, events: Base.Events },
        { flags: { energyManagement: true }, attributes: EnergyManagementComponent.Attributes },
        { flags: { tankPercent: true }, attributes: TankPercentComponent.Attributes }
    ];
    export type Features = "EnergyManagement" | "TankPercent";

    /**
     * These are optional features supported by WaterHeaterManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.5.4
     */
    export enum Feature {
        /**
         * EnergyManagement (EM)
         *
         * Allows energy management control of the tank
         */
        EnergyManagement = "EnergyManagement",

        /**
         * TankPercent (TP)
         *
         * Supports monitoring the percentage of hot water in the tank
         */
        TankPercent = "TankPercent"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.1
     */
    export interface WaterHeaterHeatSource {
        /**
         * Immersion Heating Element 1
         */
        immersionElement1?: boolean;

        /**
         * Immersion Heating Element 2
         */
        immersionElement2?: boolean;

        /**
         * Heat pump Heating
         */
        heatPump?: boolean;

        /**
         * Boiler Heating (e.g. Gas or Oil)
         */
        boiler?: boolean;

        /**
         * Other Heating
         */
        other?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.2
     */
    export enum BoostState {
        /**
         * Boost is not currently active
         */
        Inactive = 0,

        /**
         * Boost is currently active
         */
        Active = 1
    }

    /**
     * Allows a client to request that the water heater is put into a Boost state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.5.8.1
     */
    export interface BoostRequest {
        boostInfo: WaterHeaterBoostInfo;
    }

    /**
     * This event shall be generated whenever a Boost command is accepted.
     *
     * The corresponding structure fields within the WaterHeaterBoostInfoStruct are copied from the Boost command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.5.9.1
     */
    export interface BoostStartedEvent {
        boostInfo: WaterHeaterBoostInfo;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3
     */
    export interface WaterHeaterBoostInfo {
        /**
         * This field shall indicate the time period, in seconds, for which the boost state is activated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3.1
         */
        duration: number;

        /**
         * This field shall indicate whether the boost state shall be automatically canceled once the hot water has
         * reached either:
         *
         *   - the set point temperature (from the thermostat cluster)
         *
         *   - the TemporarySetpoint temperature (if specified)
         *
         *   - the TargetPercentage (if specified).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3.2
         */
        oneShot?: boolean;

        /**
         * This field shall indicate that the consumer wants the water to be heated quickly. This may cause multiple
         * heat sources to be activated (e.g. a heat pump and direct electric immersion heating element).
         *
         * The choice of which heat sources are activated is manufacturer specific.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3.3
         */
        emergencyBoost?: boolean;

        /**
         * This field shall indicate the target temperature to which the water will be heated.
         *
         * If included, it shall be used instead of the thermostat cluster set point temperature whilst the boost state
         * is activated.
         *
         * The value of this field shall be within the constraints of the MinHeatSetpointLimit and MaxHeatSetpointLimit
         * attributes (inclusive), of the thermostat cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3.4
         */
        temporarySetpoint?: number;

        /**
         * This field shall indicate the target percentage of hot water in the tank that the TankPercentage attribute
         * must reach before the heating is switched off.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3.5
         */
        targetPercentage?: number;

        /**
         * This field shall indicate the percentage to which the hot water in the tank shall be allowed to fall before
         * again beginning to reheat it.
         *
         * For example if the TargetPercentage was 80%, and the TargetReheat was 40%, then after initial heating to 80%
         * hot water, the tank may have hot water drawn off until only 40% hot water remains. At this point the heater
         * will begin to heat back up to 80% of hot water. If this field and the OneShot field were both omitted,
         * heating would begin again after any water draw which reduced the TankPercentage below 80%.
         *
         * This field shall be less than or equal to the TargetPercentage field.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.6.3.6
         */
        targetReheat?: number;
    }

    export const id: ClusterId;
    export const name: "WaterHeaterManagement";
    export const revision: 2;
    export const schema: typeof WaterHeaterManagementModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export const events: EventObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof WaterHeaterManagement;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `WaterHeaterManagement` instead of
     * `WaterHeaterManagement.Complete`)
     */
    export const Complete: typeof WaterHeaterManagement;

    export const Typing: WaterHeaterManagement;
}

export declare const WaterHeaterManagementCluster: typeof WaterHeaterManagement;
export interface WaterHeaterManagement extends ClusterTyping { Attributes: WaterHeaterManagement.Attributes; Commands: WaterHeaterManagement.Commands; Events: WaterHeaterManagement.Events; Features: WaterHeaterManagement.Features; Components: WaterHeaterManagement.Components }
