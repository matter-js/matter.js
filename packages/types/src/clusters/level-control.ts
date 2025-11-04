/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    OptionalAttribute,
    WritableAttribute,
    Command,
    TlvNoResponse,
    OptionalWritableAttribute
} from "../cluster/Cluster.js";
import { TlvUInt16, TlvUInt8, TlvBitmap, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { AccessLevel } from "#model";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { ClusterType } from "../cluster/ClusterType.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace LevelControl {
    /**
     * These are optional features supported by LevelControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.4
     */
    export enum Feature {
        /**
         * OnOff (OO)
         *
         * Dependency with the On/Off cluster
         */
        OnOff = "OnOff",

        /**
         * Lighting (LT)
         *
         * This feature supports an interface for controlling the level of a light source. For the CurrentLevel
         * attribute:
         *
         * A value of 0x00 shall NOT be used.
         *
         * A value of 0x01 shall indicate the minimum level that can be attained on a device. A value of 0xFE shall
         * indicate the maximum level that can be attained on a device. A value of null shall represent an undefined
         * value.
         *
         * All other values are application specific gradations from the minimum to the maximum level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.4.2
         */
        Lighting = "Lighting",

        /**
         * Frequency (FQ)
         *
         * NOTE The Frequency feature is provisional.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.4.3
         */
        Frequency = "Frequency"
    }

    /**
     * Input to the LevelControl moveToClosestFrequency command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.5
     */
    export const TlvMoveToClosestFrequencyRequest = TlvObject({ frequency: TlvField(0, TlvUInt16) });

    /**
     * Input to the LevelControl moveToClosestFrequency command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.5
     */
    export interface MoveToClosestFrequencyRequest extends TypeFromSchema<typeof TlvMoveToClosestFrequencyRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.1
     */
    export const Options = {
        /**
         * Dependency on On/Off cluster
         *
         * This bit indicates if this cluster has a dependency with the On/Off cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.1.1
         */
        executeIfOff: BitFlag(0),

        /**
         * Dependency on Color Control cluster
         *
         * This bit indicates if this cluster has a dependency with the Color Control cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.1.2
         */
        coupleColorTempToLevel: BitFlag(1)
    };

    /**
     * Input to the LevelControl moveToLevel command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.1
     */
    export const TlvMoveToLevelRequest = TlvObject({
        level: TlvField(0, TlvUInt8.bound({ max: 254 })),
        transitionTime: TlvField(1, TlvNullable(TlvUInt16)),
        optionsMask: TlvField(2, TlvBitmap(TlvUInt8, Options)),
        optionsOverride: TlvField(3, TlvBitmap(TlvUInt8, Options))
    });

    /**
     * Input to the LevelControl moveToLevel command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.1
     */
    export interface MoveToLevelRequest extends TypeFromSchema<typeof TlvMoveToLevelRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.2
     */
    export enum MoveMode {
        /**
         * Increase the level
         */
        Up = 0,

        /**
         * Decrease the level
         */
        Down = 1
    }

    /**
     * Input to the LevelControl move command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2
     */
    export const TlvMoveRequest = TlvObject({
        /**
         * This field shall be one of the non-reserved values in MoveModeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2.1
         */
        moveMode: TlvField(0, TlvEnum<MoveMode>()),

        /**
         * This field shall indicate the rate of movement in units per second. The actual rate of movement SHOULD be as
         * close to this rate as the device is able. If the Rate field is null, then the value of the DefaultMoveRate
         * attribute shall be used if that attribute is supported and its value is not null. If the Rate field is null
         * and the DefaultMoveRate attribute is either not supported or set to null, then the device SHOULD move as fast
         * as it is able. If the device is not able to move at a variable rate, this field may be disregarded.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2.2
         */
        rate: TlvField(1, TlvNullable(TlvUInt8)),

        optionsMask: TlvField(2, TlvBitmap(TlvUInt8, Options)),
        optionsOverride: TlvField(3, TlvBitmap(TlvUInt8, Options))
    });

    /**
     * Input to the LevelControl move command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2
     */
    export interface MoveRequest extends TypeFromSchema<typeof TlvMoveRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.3
     */
    export enum StepMode {
        /**
         * Step upwards
         */
        Up = 0,

        /**
         * Step downwards
         */
        Down = 1
    }

    /**
     * Input to the LevelControl step command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3
     */
    export const TlvStepRequest = TlvObject({
        /**
         * This field shall be one of the non-reserved values in StepModeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3.1
         */
        stepMode: TlvField(0, TlvEnum<StepMode>()),

        /**
         * This field shall indicate the change to CurrentLevel.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3.2
         */
        stepSize: TlvField(1, TlvUInt8),

        /**
         * This field shall indicate the time that shall be taken to perform the step, in tenths of a second. A step is
         * a change in the CurrentLevel of StepSize units. The actual time taken SHOULD be as close to this as the
         * device is able. If the TransitionTime field is equal to null, the device SHOULD move as fast as it is able.
         *
         * If the device is not able to move at a variable rate, the TransitionTime field may be disregarded.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3.3
         */
        transitionTime: TlvField(2, TlvNullable(TlvUInt16)),

        optionsMask: TlvField(3, TlvBitmap(TlvUInt8, Options)),
        optionsOverride: TlvField(4, TlvBitmap(TlvUInt8, Options))
    });

    /**
     * Input to the LevelControl step command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3
     */
    export interface StepRequest extends TypeFromSchema<typeof TlvStepRequest> {}

    /**
     * Input to the LevelControl stop command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.4
     */
    export const TlvStopRequest = TlvObject({
        optionsMask: TlvField(0, TlvBitmap(TlvUInt8, Options)),
        optionsOverride: TlvField(1, TlvBitmap(TlvUInt8, Options))
    });

    /**
     * Input to the LevelControl stop command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.4
     */
    export interface StopRequest extends TypeFromSchema<typeof TlvStopRequest> {}

    /**
     * A LevelControlCluster supports these elements if it supports feature Lighting.
     */
    export const LightingComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the time remaining until the current command is complete - it is specified in 1/10ths of a
             * second.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • When it changes from 0 to any value higher than 10, or
             *
             *   • When it changes, with a delta larger than 10, caused by the invoke of a command, or
             *
             *   • When it changes to 0.
             *
             * For commands with a transition time or changes to the transition time less than 1 second, changes to this
             * attribute shall NOT be reported.
             *
             * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the
             * reporting of this attribute in order to keep track of the remaining duration.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.3
             */
            remainingTime: Attribute(0x1, TlvUInt16),

            minLevel: OptionalAttribute(0x2, TlvUInt8.bound({ min: 1, max: 254 }), { default: 1 }),

            /**
             * Indicates the desired startup level for a device when it is supplied with power and this level shall be
             * reflected in the CurrentLevel attribute. The values of the StartUpCurrentLevel attribute are listed
             * below:
             *
             * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentLevel
             * attribute shall return to its value prior to the restart.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.15
             */
            startUpCurrentLevel: WritableAttribute(
                0x4000,
                TlvNullable(TlvUInt8),
                { persistent: true, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A LevelControlCluster supports these elements if doesn't support feature LT.
     */
    export const NotLightingComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the minimum value of CurrentLevel that is capable of being assigned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.4
             */
            minLevel: OptionalAttribute(0x2, TlvUInt8.bound({ max: 254 }), { default: 0 })
        }
    });

    /**
     * A LevelControlCluster supports these elements if it supports feature Frequency.
     */
    export const FrequencyComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the frequency at which the device is at CurrentLevel. A CurrentFrequency of 0 is unknown.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • At most once per second, or
             *
             *   • At the start of the movement/transition, or
             *
             *   • At the end of the movement/transition.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.6
             */
            currentFrequency: Attribute(0x4, TlvUInt16, { scene: true }),

            /**
             * Indicates the minimum value of CurrentFrequency that is capable of being assigned. MinFrequency shall be
             * less than or equal to MaxFrequency. A value of 0 indicates undefined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.7
             */
            minFrequency: Attribute(0x5, TlvUInt16),

            /**
             * Indicates the maximum value of CurrentFrequency that is capable of being assigned. MaxFrequency shall be
             * greater than or equal to MinFrequency. A value of 0 indicates undefined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.8
             */
            maxFrequency: Attribute(0x6, TlvUInt16)
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.5
             */
            moveToClosestFrequency: Command(0x8, TlvMoveToClosestFrequencyRequest, 0x8, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all LevelControl clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x8,
        name: "LevelControl",
        revision: 6,

        features: {
            /**
             * Dependency with the On/Off cluster
             */
            onOff: BitFlag(0),

            /**
             * This feature supports an interface for controlling the level of a light source. For the CurrentLevel
             * attribute:
             *
             * A value of 0x00 shall NOT be used.
             *
             * A value of 0x01 shall indicate the minimum level that can be attained on a device. A value of 0xFE shall
             * indicate the maximum level that can be attained on a device. A value of null shall represent an undefined
             * value.
             *
             * All other values are application specific gradations from the minimum to the maximum level.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.4.2
             */
            lighting: BitFlag(1),

            /**
             * NOTE The Frequency feature is provisional.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.4.3
             */
            frequency: BitFlag(2)
        },

        attributes: {
            /**
             * Indicates the current level of this device. The meaning of 'level' is device dependent.
             *
             * Changes to this attribute shall only be marked as reportable in the following cases:
             *
             *   • At most once per second, or
             *
             *   • At the end of the movement/transition, or
             *
             *   • When it changes from null to any other value and vice versa.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.2
             */
            currentLevel: Attribute(0x0, TlvNullable(TlvUInt8), { scene: true, persistent: true }),

            /**
             * Indicates the maximum value of CurrentLevel that is capable of being assigned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.5
             */
            maxLevel: OptionalAttribute(0x3, TlvUInt8.bound({ max: 254 }), { default: 254 }),

            /**
             * Indicates the selected options of the device.
             *
             * The Options attribute is a bitmap that determines the default behavior of some cluster commands. Each
             * command that is dependent on the Options attribute shall first construct a temporary Options bitmap that
             * is in effect during the command processing. The temporary Options bitmap has the same format and meaning
             * as the Options attribute, but includes any bits that may be overridden by command fields.
             *
             * This attribute is meant to be changed only during commissioning.
             *
             * Command execution shall NOT continue beyond the Options processing if all of these criteria are true:
             *
             *   • The command is one of the ‘without On/Off’ commands: Move, Move to Level, Step, or Stop.
             *
             *   • The On/Off cluster exists on the same endpoint as this cluster.
             *
             *   • The OnOff attribute of the On/Off cluster, on this endpoint, is FALSE.
             *
             *   • The value of the ExecuteIfOff bit is 0.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.9
             */
            options: WritableAttribute(0xf, TlvBitmap(TlvUInt8, Options)),

            /**
             * Indicates the time taken to move to or from the target level when On or Off commands are received by an
             * On/Off cluster on the same endpoint. It is specified in 1/10ths of a second.
             *
             * The actual time taken SHOULD be as close to OnOffTransitionTime as the device is able. Please note that
             * if the device is not able to move at a variable rate, the OnOffTransitionTime attribute SHOULD NOT be
             * implemented.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.10
             */
            onOffTransitionTime: OptionalWritableAttribute(0x10, TlvUInt16, { default: 0 }),

            /**
             * Indicates the value that the CurrentLevel attribute is set to when the OnOff attribute of an On/Off
             * cluster on the same endpoint is set to TRUE, as a result of processing an On/Off cluster command. If the
             * OnLevel attribute is not implemented, or is set to the null value, it has no effect. For more details see
             * Effect of On/Off Commands on the CurrentLevel attribute.
             *
             * OnLevel represents a mandatory field that was previously not present or optional. Implementers should be
             * aware that older devices may not implement it.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.11
             */
            onLevel: WritableAttribute(0x11, TlvNullable(TlvUInt8)),

            /**
             * Indicates the time taken to move the current level from the minimum level to the maximum level when an On
             * command is received by an On/Off cluster on the same endpoint. It is specified in 1/10ths of a second. If
             * this attribute is not implemented, or contains a null value, the OnOffTransitionTime shall be used
             * instead.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.12
             */
            onTransitionTime: OptionalWritableAttribute(0x12, TlvNullable(TlvUInt16), { default: null }),

            /**
             * Indicates the time taken to move the current level from the maximum level to the minimum level when an
             * Off command is received by an On/Off cluster on the same endpoint. It is specified in 1/10ths of a
             * second. If this attribute is not implemented, or contains a null value, the OnOffTransitionTime shall be
             * used instead.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.13
             */
            offTransitionTime: OptionalWritableAttribute(0x13, TlvNullable(TlvUInt16), { default: null }),

            /**
             * Indicates the movement rate, in units per second, when a Move command is received with a null value Rate
             * parameter.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.14
             */
            defaultMoveRate: OptionalWritableAttribute(0x14, TlvNullable(TlvUInt8.bound({ min: 1 })))
        },

        commands: {
            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.1
             */
            moveToLevel: Command(0x0, TlvMoveToLevelRequest, 0x0, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2
             */
            move: Command(0x1, TlvMoveRequest, 0x1, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3
             */
            step: Command(0x2, TlvStepRequest, 0x2, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.4
             */
            stop: Command(0x3, TlvStopRequest, 0x3, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
             */
            moveToLevelWithOnOff: Command(0x4, TlvMoveToLevelRequest, 0x4, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
             */
            moveWithOnOff: Command(0x5, TlvMoveRequest, 0x5, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
             */
            stepWithOnOff: Command(0x6, TlvStepRequest, 0x6, TlvNoResponse),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
             */
            stopWithOnOff: Command(0x7, TlvStopRequest, 0x7, TlvNoResponse)
        },

        /**
         * This metadata controls which LevelControlCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { lighting: true }, component: LightingComponent },
            { flags: { lighting: false }, component: NotLightingComponent },
            { flags: { frequency: true }, component: FrequencyComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(
        { ...Base, supportedFeatures: { onOff: true }, base: ClusterType(Base) },
        NotLightingComponent
    );

    /**
     * This cluster provides an interface for controlling a characteristic of a device that can be set to a level, for
     * example the brightness of a light, the degree of closure of a door, or the power output of a heater.
     *
     * LevelControlCluster supports optional features that you can enable with the LevelControlCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const LT = { lighting: true };
    const FQ = { frequency: true };

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
            remainingTime: MutableCluster.AsConditional(
                LightingComponent.attributes.remainingTime,
                { mandatoryIf: [LT] }
            ),
            minLevel: MutableCluster.AsConditional(LightingComponent.attributes.minLevel, { optionalIf: [LT] }),
            currentFrequency: MutableCluster.AsConditional(
                FrequencyComponent.attributes.currentFrequency,
                { mandatoryIf: [FQ] }
            ),
            minFrequency: MutableCluster.AsConditional(
                FrequencyComponent.attributes.minFrequency,
                { mandatoryIf: [FQ] }
            ),
            maxFrequency: MutableCluster.AsConditional(
                FrequencyComponent.attributes.maxFrequency,
                { mandatoryIf: [FQ] }
            ),
            startUpCurrentLevel: MutableCluster.AsConditional(
                LightingComponent.attributes.startUpCurrentLevel,
                { mandatoryIf: [LT] }
            )
        },

        commands: {
            ...Cluster.commands,
            moveToClosestFrequency: MutableCluster.AsConditional(
                FrequencyComponent.commands.moveToClosestFrequency,
                { mandatoryIf: [FQ] }
            )
        }
    });

    /**
     * This cluster supports all LevelControl features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type LevelControlCluster = LevelControl.Cluster;
export const LevelControlCluster = LevelControl.Cluster;
ClusterRegistry.register(LevelControl.Complete);
