/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { FanControl as FanControlModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the FanControl cluster.
 */
export namespace FanControl {
    /**
     * {@link FanControl} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the current speed mode of the fan.
             *
             * This attribute shall be set to one of the values in FanModeEnum supported by the server as indicated in
             * the FanModeSequence attribute. The Low value shall be supported if and only if the FanModeSequence
             * attribute value is less than 4. The Medium value shall be supported if and only if the FanModeSequence
             * attribute value is 0 or 2.
             *
             * This attribute may be written by a client to request a different fan mode. The server shall return
             * INVALID_IN_STATE to indicate that the fan is not in a state where this attribute can be changed to the
             * requested value.
             *
             * The server may have values that this attribute can never be set to or that will be ignored by the server.
             * For example, where this cluster appears on the same or another endpoint as other clusters with a system
             * dependency, for example the Thermostat cluster, attempting to set this attribute to Off may not be
             * allowed by the system.
             *
             * If an attempt is made to set this attribute to a value not supported by the server as indicated in the
             * FanModeSequence attribute, the server shall respond with CONSTRAINT_ERROR.
             *
             * When this attribute is successfully written to, the PercentSetting and SpeedSetting (if present)
             * attributes shall be set to appropriate values, as defined by Section 4.4.6.3.1, “Percent Rules” and
             * Section 4.4.6.6.1, “Speed Rules” respectively, unless otherwise specified below.
             *
             * When this attribute is set to any valid value, the PercentCurrent and SpeedCurrent (if present)
             * attributes shall indicate the actual currently operating fan speed, unless otherwise specified below.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.1
             */
            fanMode: FanMode;

            /**
             * This attribute indicates the fan speed ranges that shall be supported by the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.2
             */
            readonly fanModeSequence: FanModeSequence;

            /**
             * Indicates the speed setting for the fan with a value of 0 indicating that the fan is off and a value of
             * 100 indicating that the fan is set to run at its maximum speed. If the FanMode attribute is set to Auto,
             * the value of this attribute shall be set to null.
             *
             * This attribute may be written to by a client to indicate a new fan speed. If a client writes null to this
             * attribute, the attribute value shall NOT change. If the fan is in a state where this attribute cannot be
             * changed to the requested value, the server shall return INVALID_IN_STATE.
             *
             * When this attribute is successfully written, the server shall set the value of the FanMode and
             * SpeedSetting (if present) attributes to values that abide by the mapping requirements listed below.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.3
             */
            percentSetting: number | null;

            /**
             * Indicates the actual currently operating fan speed, or zero to indicate that the fan is off. There may be
             * a temporary mismatch between the value of this attribute and the value of the PercentSetting attribute
             * due to other system requirements or constraints that would not allow the fan to operate at the requested
             * setting.
             *
             * For example, if the value of this attribute is currently 50%, and the PercentSetting attribute is newly
             * set to 25%, the value of this attribute may stay above 25% for a period necessary to dissipate internal
             * heat, maintain product operational safety, etc.
             *
             * When the value of the FanMode attribute is AUTO, the value of this attribute may vary across the range
             * over time.
             *
             * See Section 4.4.6.3.1, “Percent Rules” for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.4
             */
            readonly percentCurrent: number;
        }
    }

    /**
     * {@link FanControl} supports these elements if it supports feature "MultiSpeed".
     */
    export namespace MultiSpeedComponent {
        export interface Attributes {
            /**
             * Indicates the maximum value to which the SpeedSetting attribute can be set.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.5
             */
            readonly speedMax: number;

            /**
             * Indicates the speed setting for the fan. This attribute may be written by a client to indicate a new fan
             * speed. If the FanMode attribute is set to Auto, the value of this attribute shall be set to null.
             *
             * The server shall support all values between 0 and SpeedMax.
             *
             * If a client writes null to this attribute, the attribute value shall NOT change. If the fan is in a state
             * where this attribute cannot be changed to the requested value, the server shall return INVALID_IN_STATE.
             *
             * When this attribute is successfully written to, the server shall set the value of the FanMode and
             * PercentSetting attributes to values that abide by the mapping requirements listed below.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.6
             */
            speedSetting: number | null;

            /**
             * Indicates the actual currently operating fan speed, or zero to indicate that the fan is off. There may be
             * a temporary mismatch between the value of this attribute and the value of the SpeedSetting attribute due
             * to other system requirements or constraints that would not allow the fan to operate at the requested
             * setting.
             *
             * For example, if the value of this attribute is currently 5, and the SpeedSetting attribute is newly set
             * to 2, the value of this attribute may stay above 2 for a period necessary to dissipate internal heat,
             * maintain product operational safety, etc.
             *
             * When the value of the FanMode attribute is AUTO, the value of this attribute may vary across the range
             * over time.
             *
             * See Section 4.4.6.6.1, “Speed Rules” for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.7
             */
            readonly speedCurrent: number;
        }
    }

    /**
     * {@link FanControl} supports these elements if it supports feature "Rocking".
     */
    export namespace RockingComponent {
        export interface Attributes {
            /**
             * This attribute is a bitmap that indicates the rocking motions that are supported by the server.
             *
             * If this attribute is supported by the server, at least one bit shall be set in this attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.8
             */
            readonly rockSupport: Rock;

            /**
             * This attribute is a bitmap that indicates the currently active fan rocking motion setting. Each bit shall
             * only be set to 1, if the corresponding bit in the RockSupport attribute is set to 1, otherwise a status
             * code of CONSTRAINT_ERROR shall be returned.
             *
             * If a combination of supported bits is set by a client, and the server does not support the combination,
             * the lowest supported single bit in the combination shall be set and active, and all other bits shall
             * indicate zero.
             *
             * For example: If RockUpDown and RockRound are both set, but this combination is not possible, then only
             * RockUpDown becomes active.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.9
             */
            rockSetting: Rock;
        }
    }

    /**
     * {@link FanControl} supports these elements if it supports feature "Wind".
     */
    export namespace WindComponent {
        export interface Attributes {
            /**
             * This attribute is a bitmap that indicates what wind modes are supported by the server.
             *
             * If this attribute is supported by the server, at least one bit shall be set in this attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.10
             */
            readonly windSupport: Wind;

            /**
             * This attribute is a bitmap that indicates the current active fan wind feature settings. Each bit shall
             * only be set to 1, if the corresponding bit in the WindSupport attribute is set to 1, otherwise a status
             * code of CONSTRAINT_ERROR shall be returned.
             *
             * If a combination of supported bits is set by a client, and the server does not support the combination,
             * the lowest supported single bit in the combination shall be set and active, and all other bits shall
             * indicate zero.
             *
             * For example: If Sleep Wind and Natural Wind are set, but this combination is not possible, then only
             * Sleep Wind becomes active.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.11
             */
            windSetting: Wind;
        }
    }

    /**
     * {@link FanControl} supports these elements if it supports feature "AirflowDirection".
     */
    export namespace AirflowDirectionComponent {
        export interface Attributes {
            /**
             * Indicates the current airflow direction of the fan. This attribute may be written by a client to indicate
             * a new airflow direction for the fan. This attribute shall be set to one of the values in the
             * AirflowDirectionEnum table.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.12
             */
            airflowDirection: AirflowDirection;
        }
    }

    /**
     * {@link FanControl} supports these elements if it supports feature "Step".
     */
    export namespace StepComponent {
        export interface Commands {
            /**
             * This command indirectly changes the speed-oriented attributes of the fan in steps rather than using the
             * speed-oriented attributes, FanMode, PercentSetting, or SpeedSetting, directly. This command supports, for
             * example, a user-operated and wall-mounted toggle switch that can be used to increase or decrease the
             * speed of the fan by pressing the toggle switch up or down until the desired fan speed is reached. How
             * this command is interpreted by the server and how it affects the values of the speed-oriented attributes
             * is implementation specific.
             *
             * For example, a fan supports this command, and the value of the FanModeSequence attribute is 0. The
             * current value of the FanMode attribute is 2, or Medium. This command is received with the Direction field
             * set to Increase. As per it’s specific implementation, the server reacts to the command by setting the
             * value of the FanMode attribute to 3, or High, which in turn sets the PercentSetting and SpeedSetting (if
             * present) attributes to appropriate values, as defined by Section 4.4.6.3.1, “Percent Rules” and Section
             * 4.4.6.6.1, “Speed Rules” respectively.
             *
             * This command supports these fields:
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1
             */
            step(request: StepRequest): MaybePromise;
        }
    }

    /**
     * Attributes that may appear in {@link FanControl}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current speed mode of the fan.
         *
         * This attribute shall be set to one of the values in FanModeEnum supported by the server as indicated in the
         * FanModeSequence attribute. The Low value shall be supported if and only if the FanModeSequence attribute
         * value is less than 4. The Medium value shall be supported if and only if the FanModeSequence attribute value
         * is 0 or 2.
         *
         * This attribute may be written by a client to request a different fan mode. The server shall return
         * INVALID_IN_STATE to indicate that the fan is not in a state where this attribute can be changed to the
         * requested value.
         *
         * The server may have values that this attribute can never be set to or that will be ignored by the server. For
         * example, where this cluster appears on the same or another endpoint as other clusters with a system
         * dependency, for example the Thermostat cluster, attempting to set this attribute to Off may not be allowed by
         * the system.
         *
         * If an attempt is made to set this attribute to a value not supported by the server as indicated in the
         * FanModeSequence attribute, the server shall respond with CONSTRAINT_ERROR.
         *
         * When this attribute is successfully written to, the PercentSetting and SpeedSetting (if present) attributes
         * shall be set to appropriate values, as defined by Section 4.4.6.3.1, “Percent Rules” and Section 4.4.6.6.1,
         * “Speed Rules” respectively, unless otherwise specified below.
         *
         * When this attribute is set to any valid value, the PercentCurrent and SpeedCurrent (if present) attributes
         * shall indicate the actual currently operating fan speed, unless otherwise specified below.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.1
         */
        fanMode: FanMode;

        /**
         * This attribute indicates the fan speed ranges that shall be supported by the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.2
         */
        readonly fanModeSequence: FanModeSequence;

        /**
         * Indicates the speed setting for the fan with a value of 0 indicating that the fan is off and a value of 100
         * indicating that the fan is set to run at its maximum speed. If the FanMode attribute is set to Auto, the
         * value of this attribute shall be set to null.
         *
         * This attribute may be written to by a client to indicate a new fan speed. If a client writes null to this
         * attribute, the attribute value shall NOT change. If the fan is in a state where this attribute cannot be
         * changed to the requested value, the server shall return INVALID_IN_STATE.
         *
         * When this attribute is successfully written, the server shall set the value of the FanMode and SpeedSetting
         * (if present) attributes to values that abide by the mapping requirements listed below.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.3
         */
        percentSetting: number | null;

        /**
         * Indicates the actual currently operating fan speed, or zero to indicate that the fan is off. There may be a
         * temporary mismatch between the value of this attribute and the value of the PercentSetting attribute due to
         * other system requirements or constraints that would not allow the fan to operate at the requested setting.
         *
         * For example, if the value of this attribute is currently 50%, and the PercentSetting attribute is newly set
         * to 25%, the value of this attribute may stay above 25% for a period necessary to dissipate internal heat,
         * maintain product operational safety, etc.
         *
         * When the value of the FanMode attribute is AUTO, the value of this attribute may vary across the range over
         * time.
         *
         * See Section 4.4.6.3.1, “Percent Rules” for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.4
         */
        readonly percentCurrent: number;

        /**
         * Indicates the maximum value to which the SpeedSetting attribute can be set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.5
         */
        readonly speedMax: number;

        /**
         * Indicates the speed setting for the fan. This attribute may be written by a client to indicate a new fan
         * speed. If the FanMode attribute is set to Auto, the value of this attribute shall be set to null.
         *
         * The server shall support all values between 0 and SpeedMax.
         *
         * If a client writes null to this attribute, the attribute value shall NOT change. If the fan is in a state
         * where this attribute cannot be changed to the requested value, the server shall return INVALID_IN_STATE.
         *
         * When this attribute is successfully written to, the server shall set the value of the FanMode and
         * PercentSetting attributes to values that abide by the mapping requirements listed below.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.6
         */
        speedSetting: number | null;

        /**
         * Indicates the actual currently operating fan speed, or zero to indicate that the fan is off. There may be a
         * temporary mismatch between the value of this attribute and the value of the SpeedSetting attribute due to
         * other system requirements or constraints that would not allow the fan to operate at the requested setting.
         *
         * For example, if the value of this attribute is currently 5, and the SpeedSetting attribute is newly set to 2,
         * the value of this attribute may stay above 2 for a period necessary to dissipate internal heat, maintain
         * product operational safety, etc.
         *
         * When the value of the FanMode attribute is AUTO, the value of this attribute may vary across the range over
         * time.
         *
         * See Section 4.4.6.6.1, “Speed Rules” for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.7
         */
        readonly speedCurrent: number;

        /**
         * This attribute is a bitmap that indicates the rocking motions that are supported by the server.
         *
         * If this attribute is supported by the server, at least one bit shall be set in this attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.8
         */
        readonly rockSupport: Rock;

        /**
         * This attribute is a bitmap that indicates the currently active fan rocking motion setting. Each bit shall
         * only be set to 1, if the corresponding bit in the RockSupport attribute is set to 1, otherwise a status code
         * of CONSTRAINT_ERROR shall be returned.
         *
         * If a combination of supported bits is set by a client, and the server does not support the combination, the
         * lowest supported single bit in the combination shall be set and active, and all other bits shall indicate
         * zero.
         *
         * For example: If RockUpDown and RockRound are both set, but this combination is not possible, then only
         * RockUpDown becomes active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.9
         */
        rockSetting: Rock;

        /**
         * This attribute is a bitmap that indicates what wind modes are supported by the server.
         *
         * If this attribute is supported by the server, at least one bit shall be set in this attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.10
         */
        readonly windSupport: Wind;

        /**
         * This attribute is a bitmap that indicates the current active fan wind feature settings. Each bit shall only
         * be set to 1, if the corresponding bit in the WindSupport attribute is set to 1, otherwise a status code of
         * CONSTRAINT_ERROR shall be returned.
         *
         * If a combination of supported bits is set by a client, and the server does not support the combination, the
         * lowest supported single bit in the combination shall be set and active, and all other bits shall indicate
         * zero.
         *
         * For example: If Sleep Wind and Natural Wind are set, but this combination is not possible, then only Sleep
         * Wind becomes active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.11
         */
        windSetting: Wind;

        /**
         * Indicates the current airflow direction of the fan. This attribute may be written by a client to indicate a
         * new airflow direction for the fan. This attribute shall be set to one of the values in the
         * AirflowDirectionEnum table.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.12
         */
        airflowDirection: AirflowDirection;
    }

    export interface Commands extends StepComponent.Commands {}

    export type Components = [
        { flags: {}, attributes: Base.Attributes },
        { flags: { multiSpeed: true }, attributes: MultiSpeedComponent.Attributes },
        { flags: { rocking: true }, attributes: RockingComponent.Attributes },
        { flags: { wind: true }, attributes: WindComponent.Attributes },
        { flags: { airflowDirection: true }, attributes: AirflowDirectionComponent.Attributes },
        { flags: { step: true }, commands: StepComponent.Commands }
    ];

    export type Features = "MultiSpeed" | "Auto" | "Rocking" | "Wind" | "Step" | "AirflowDirection";

    /**
     * These are optional features supported by FanControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.4
     */
    export enum Feature {
        /**
         * MultiSpeed (SPD)
         *
         * Legacy Fan Control cluster revision 0-1 defined 3 speeds (low, medium and high) plus automatic speed control
         * but left it up to the implementer to decide what was supported. Therefore, it is assumed that legacy client
         * implementations are capable of determining, from the server, the number of speeds supported between 1, 2, or
         * 3, and whether automatic speed control is supported.
         *
         * The MultiSpeed feature includes attributes that support a running fan speed value from 0 to SpeedMax.
         *
         * See Section 4.4.6.6.1, “Speed Rules” for more details.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.4.1
         */
        MultiSpeed = "MultiSpeed",

        /**
         * Auto (AUT)
         *
         * Automatic mode supported for fan speed
         */
        Auto = "Auto",

        /**
         * Rocking (RCK)
         *
         * Rocking movement supported
         */
        Rocking = "Rocking",

        /**
         * Wind (WND)
         *
         * Wind emulation supported
         */
        Wind = "Wind",

        /**
         * Step (STEP)
         *
         * Step command supported
         */
        Step = "Step",

        /**
         * AirflowDirection (DIR)
         *
         * Airflow Direction attribute is supported
         */
        AirflowDirection = "AirflowDirection"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.5
     */
    export enum FanMode {
        /**
         * Fan is off
         */
        Off = 0,

        /**
         * Fan using low speed
         */
        Low = 1,

        /**
         * Fan using medium speed
         */
        Medium = 2,

        /**
         * Fan using high speed
         */
        High = 3,

        /**
         * @deprecated
         */
        On = 4,

        /**
         * Fan is using auto mode
         */
        Auto = 5,

        /**
         * Fan is using smart mode
         *
         * @deprecated
         */
        Smart = 6
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.6
     */
    export enum FanModeSequence {
        /**
         * Fan is capable of off, low, medium and high modes
         */
        OffLowMedHigh = 0,

        /**
         * Fan is capable of off, low and high modes
         */
        OffLowHigh = 1,

        /**
         * Fan is capable of off, low, medium, high and auto modes
         */
        OffLowMedHighAuto = 2,

        /**
         * Fan is capable of off, low, high and auto modes
         */
        OffLowHighAuto = 3,

        /**
         * Fan is capable of off, high and auto modes
         */
        OffHighAuto = 4,

        /**
         * Fan is capable of off and high modes
         */
        OffHigh = 5
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.1
     */
    export interface Rock {
        /**
         * Indicate rock left to right
         */
        rockLeftRight?: boolean;

        /**
         * Indicate rock up and down
         */
        rockUpDown?: boolean;

        /**
         * Indicate rock around
         */
        rockRound?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.2
     */
    export interface Wind {
        /**
         * Indicate sleep wind
         *
         * The fan speed, based on current settings, shall gradually slow down to a final minimum speed. For this
         * process, the sequence, speeds and duration are MS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.2.1
         */
        sleepWind?: boolean;

        /**
         * Indicate natural wind
         *
         * The fan speed shall vary to emulate natural wind. For this setting, the sequence, speeds and duration are MS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.2.2
         */
        naturalWind?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.4
     */
    export enum AirflowDirection {
        /**
         * Airflow is in the forward direction
         */
        Forward = 0,

        /**
         * Airflow is in the reverse direction
         */
        Reverse = 1
    }

    /**
     * This command indirectly changes the speed-oriented attributes of the fan in steps rather than using the
     * speed-oriented attributes, FanMode, PercentSetting, or SpeedSetting, directly. This command supports, for
     * example, a user-operated and wall-mounted toggle switch that can be used to increase or decrease the speed of the
     * fan by pressing the toggle switch up or down until the desired fan speed is reached. How this command is
     * interpreted by the server and how it affects the values of the speed-oriented attributes is implementation
     * specific.
     *
     * For example, a fan supports this command, and the value of the FanModeSequence attribute is 0. The current value
     * of the FanMode attribute is 2, or Medium. This command is received with the Direction field set to Increase. As
     * per it’s specific implementation, the server reacts to the command by setting the value of the FanMode attribute
     * to 3, or High, which in turn sets the PercentSetting and SpeedSetting (if present) attributes to appropriate
     * values, as defined by Section 4.4.6.3.1, “Percent Rules” and Section 4.4.6.6.1, “Speed Rules” respectively.
     *
     * This command supports these fields:
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1
     */
    export interface StepRequest {
        /**
         * This field shall indicate whether the speed-oriented attributes increase or decrease to the next step value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1.1
         */
        direction: StepDirection;

        /**
         * This field shall indicate if the speed-oriented attributes wrap between highest and lowest step value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1.2
         */
        wrap?: boolean;

        /**
         * This field shall indicate that the fan being off (FanMode = Off, PercentSetting = 0, or SpeedSetting = 0) is
         * included as a step value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1.3
         */
        lowestOff?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.3
     */
    export enum StepDirection {
        /**
         * Step moves in increasing direction
         */
        Increase = 0,

        /**
         * Step moves in decreasing direction
         */
        Decrease = 1
    }

    export const id = ClusterId(0x202);
    export const name = "FanControl" as const;
    export const revision = 5;
    export const schema = FanControlModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof FanControl;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `FanControl` instead of `FanControl.Complete`)
     */
    export type Complete = typeof FanControl;

    export declare const Complete: Complete;
    export declare const Typing: FanControl;
}

ClusterNamespace.define(FanControl);
export type FanControlCluster = FanControl.Cluster;
export const FanControlCluster = FanControl.Cluster;
export interface FanControl extends ClusterTyping { Attributes: FanControl.Attributes; Commands: FanControl.Commands; Features: FanControl.Features; Components: FanControl.Components }
