/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, WritableAttribute, Attribute, Command, TlvNoResponse } from "../cluster/Cluster.js";
import { TlvUInt8, TlvBitmap, TlvEnum, TlvPercent } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace FanControl {
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
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.1
     */
    export const Rock = {
        /**
         * Indicate rock left to right
         */
        rockLeftRight: BitFlag(0),

        /**
         * Indicate rock up and down
         */
        rockUpDown: BitFlag(1),

        /**
         * Indicate rock around
         */
        rockRound: BitFlag(2)
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.2
     */
    export const Wind = {
        /**
         * Indicate sleep wind
         *
         * The fan speed, based on current settings, shall gradually slow down to a final minimum speed. For this
         * process, the sequence, speeds and duration are MS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.2.1
         */
        sleepWind: BitFlag(0),

        /**
         * Indicate natural wind
         *
         * The fan speed shall vary to emulate natural wind. For this setting, the sequence, speeds and duration are MS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.5.2.2
         */
        naturalWind: BitFlag(1)
    };

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

    /**
     * Input to the FanControl step command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1
     */
    export const TlvStepRequest = TlvObject({
        /**
         * This field shall indicate whether the speed-oriented attributes increase or decrease to the next step value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1.1
         */
        direction: TlvField(0, TlvEnum<StepDirection>()),

        /**
         * This field shall indicate if the speed-oriented attributes wrap between highest and lowest step value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1.2
         */
        wrap: TlvOptionalField(1, TlvBoolean),

        /**
         * This field shall indicate that the fan being off
         *
         * = 0) is included as a step value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1.3
         */
        lowestOff: TlvOptionalField(2, TlvBoolean)
    });

    /**
     * Input to the FanControl step command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.4.7.1
     */
    export interface StepRequest extends TypeFromSchema<typeof TlvStepRequest> {}

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
     * A FanControlCluster supports these elements if it supports feature MultiSpeed.
     */
    export const MultiSpeedComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum value to which the SpeedSetting attribute can be set.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.5
             */
            speedMax: FixedAttribute(0x4, TlvUInt8.bound({ min: 1, max: 100 })),

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
            speedSetting: WritableAttribute(0x5, TlvNullable(TlvUInt8)),

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
            speedCurrent: Attribute(0x6, TlvUInt8)
        }
    });

    /**
     * A FanControlCluster supports these elements if it supports feature Rocking.
     */
    export const RockingComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute is a bitmap that indicates the rocking motions that are supported by the server. If this
             * attribute is supported by the server, at least one bit shall be set in this attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.8
             */
            rockSupport: FixedAttribute(0x7, TlvBitmap(TlvUInt8, Rock)),

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
            rockSetting: WritableAttribute(0x8, TlvBitmap(TlvUInt8, Rock))
        }
    });

    /**
     * A FanControlCluster supports these elements if it supports feature Wind.
     */
    export const WindComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute is a bitmap that indicates what wind modes are supported by the server. If this attribute
             * is supported by the server, at least one bit shall be set in this attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.10
             */
            windSupport: FixedAttribute(0x9, TlvBitmap(TlvUInt8, Wind)),

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
            windSetting: WritableAttribute(0xa, TlvBitmap(TlvUInt8, Wind))
        }
    });

    /**
     * A FanControlCluster supports these elements if it supports feature AirflowDirection.
     */
    export const AirflowDirectionComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the current airflow direction of the fan. This attribute may be written by a client to indicate
             * a new airflow direction for the fan. This attribute shall be set to one of the values in the
             * AirflowDirectionEnum table.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.12
             */
            airflowDirection: WritableAttribute(0xb, TlvEnum<AirflowDirection>())
        }
    });

    /**
     * A FanControlCluster supports these elements if it supports feature Step.
     */
    export const StepComponent = MutableCluster.Component({
        commands: {
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
            step: Command(0x0, TlvStepRequest, 0x0, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all FanControl clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x202,
        name: "FanControl",
        revision: 5,

        features: {
            /**
             * Legacy Fan Control cluster revision 0-1 defined 3 speeds (low, medium and high) plus automatic speed
             * control but left it up to the implementer to decide what was supported. Therefore, it is assumed that
             * legacy client implementations are capable of determining, from the server, the number of speeds supported
             * between 1, 2, or 3, and whether automatic speed control is supported.
             *
             * The MultiSpeed feature includes attributes that support a running fan speed value from 0 to SpeedMax.
             *
             * See Section 4.4.6.6.1, “Speed Rules” for more details.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.4.1
             */
            multiSpeed: BitFlag(0),

            /**
             * Automatic mode supported for fan speed
             */
            auto: BitFlag(1),

            /**
             * Rocking movement supported
             */
            rocking: BitFlag(2),

            /**
             * Wind emulation supported
             */
            wind: BitFlag(3),

            /**
             * Step command supported
             */
            step: BitFlag(4),

            /**
             * Airflow Direction attribute is supported
             */
            airflowDirection: BitFlag(5)
        },

        attributes: {
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
            fanMode: WritableAttribute(0x0, TlvEnum<FanMode>(), { persistent: true }),

            /**
             * This attribute indicates the fan speed ranges that shall be supported by the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 4.4.6.2
             */
            fanModeSequence: FixedAttribute(0x1, TlvEnum<FanModeSequence>()),

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
            percentSetting: WritableAttribute(0x2, TlvNullable(TlvPercent)),

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
            percentCurrent: Attribute(0x3, TlvPercent)
        },

        /**
         * This metadata controls which FanControlCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { multiSpeed: true }, component: MultiSpeedComponent },
            { flags: { rocking: true }, component: RockingComponent },
            { flags: { wind: true }, component: WindComponent },
            { flags: { airflowDirection: true }, component: AirflowDirectionComponent },
            { flags: { step: true }, component: StepComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster specifies an interface to control the speed of a fan.
     *
     * FanControlCluster supports optional features that you can enable with the FanControlCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const SPD = { multiSpeed: true };
    const RCK = { rocking: true };
    const WND = { wind: true };
    const DIR = { airflowDirection: true };
    const STEP = { step: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            speedMax: MutableCluster.AsConditional(MultiSpeedComponent.attributes.speedMax, { mandatoryIf: [SPD] }),
            speedSetting: MutableCluster.AsConditional(
                MultiSpeedComponent.attributes.speedSetting,
                { mandatoryIf: [SPD] }
            ),
            speedCurrent: MutableCluster.AsConditional(
                MultiSpeedComponent.attributes.speedCurrent,
                { mandatoryIf: [SPD] }
            ),
            rockSupport: MutableCluster.AsConditional(RockingComponent.attributes.rockSupport, { mandatoryIf: [RCK] }),
            rockSetting: MutableCluster.AsConditional(RockingComponent.attributes.rockSetting, { mandatoryIf: [RCK] }),
            windSupport: MutableCluster.AsConditional(WindComponent.attributes.windSupport, { mandatoryIf: [WND] }),
            windSetting: MutableCluster.AsConditional(WindComponent.attributes.windSetting, { mandatoryIf: [WND] }),
            airflowDirection: MutableCluster.AsConditional(
                AirflowDirectionComponent.attributes.airflowDirection,
                { mandatoryIf: [DIR] }
            )
        },

        commands: { step: MutableCluster.AsConditional(StepComponent.commands.step, { mandatoryIf: [STEP] }) }
    });

    /**
     * This cluster supports all FanControl features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type FanControlCluster = FanControl.Cluster;
export const FanControlCluster = FanControl.Cluster;
ClusterRegistry.register(FanControl.Complete);
