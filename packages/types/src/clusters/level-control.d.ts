/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the LevelControl cluster.
 *
 * This cluster provides an interface for controlling a characteristic of a device that can be set to a level, for
 * example the brightness of a light, the degree of closure of a door, or the power output of a heater.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 1.6
 */
export declare namespace LevelControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0008;

    /**
     * Textual cluster identifier.
     */
    export const name: "LevelControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 6;

    /**
     * Canonical metadata for the LevelControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link LevelControl} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the current level of this device. The meaning of 'level' is device dependent.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second, or
         *
         *   - At the end of the movement/transition, or
         *
         *   - When it changes from null to any other value and vice versa.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.2
         */
        currentLevel: number | null;

        /**
         * Indicates the value that the CurrentLevel attribute is set to when the OnOff attribute of an On/Off cluster
         * on the same endpoint is set to TRUE, as a result of processing an On/Off cluster command. If the OnLevel
         * attribute is not implemented, or is set to the null value, it has no effect. For more details see Effect of
         * On/Off Commands on the CurrentLevel attribute.
         *
         * OnLevel represents a mandatory field that was previously not present or optional. Implementers should be
         * aware that older devices may not implement it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.11
         */
        onLevel: number | null;

        /**
         * Indicates the selected options of the device.
         *
         * The Options attribute is a bitmap that determines the default behavior of some cluster commands. Each command
         * that is dependent on the Options attribute shall first construct a temporary Options bitmap that is in effect
         * during the command processing. The temporary Options bitmap has the same format and meaning as the Options
         * attribute, but includes any bits that may be overridden by command fields.
         *
         * This attribute is meant to be changed only during commissioning.
         *
         * Command execution shall NOT continue beyond the Options processing if all of these criteria are true:
         *
         *   - The command is one of the ‘without On/Off’ commands: Move, Move to Level, Step, or Stop.
         *
         *   - The On/Off cluster exists on the same endpoint as this cluster.
         *
         *   - The OnOff attribute of the On/Off cluster, on this endpoint, is FALSE.
         *
         *   - The value of the ExecuteIfOff bit is 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.9
         */
        options: Options;

        /**
         * Indicates the maximum value of CurrentLevel that is capable of being assigned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.5
         */
        maxLevel?: number;

        /**
         * Indicates the time taken to move to or from the target level when On or Off commands are received by an
         * On/Off cluster on the same endpoint. It is specified in 1/10ths of a second.
         *
         * The actual time taken SHOULD be as close to OnOffTransitionTime as the device is able. Please note that if
         * the device is not able to move at a variable rate, the OnOffTransitionTime attribute SHOULD NOT be
         * implemented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.10
         */
        onOffTransitionTime?: number;

        /**
         * Indicates the time taken to move the current level from the minimum level to the maximum level when an On
         * command is received by an On/Off cluster on the same endpoint. It is specified in 1/10ths of a second. If
         * this attribute is not implemented, or contains a null value, the OnOffTransitionTime shall be used instead.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.12
         */
        onTransitionTime?: number | null;

        /**
         * Indicates the time taken to move the current level from the maximum level to the minimum level when an Off
         * command is received by an On/Off cluster on the same endpoint. It is specified in 1/10ths of a second. If
         * this attribute is not implemented, or contains a null value, the OnOffTransitionTime shall be used instead.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.13
         */
        offTransitionTime?: number | null;

        /**
         * Indicates the movement rate, in units per second, when a Move command is received with a null value Rate
         * parameter.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.14
         */
        defaultMoveRate?: number | null;
    }

    /**
     * {@link LevelControl} supports these elements if it supports feature "Lighting".
     */
    export interface LightingAttributes {
        /**
         * Indicates the time remaining until the current command is complete - it is specified in 1/10ths of a second.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When it changes from 0 to any value higher than 10, or
         *
         *   - When it changes, with a delta larger than 10, caused by the invoke of a command, or
         *
         *   - When it changes to 0.
         *
         * For commands with a transition time or changes to the transition time less than 1 second, changes to this
         * attribute shall NOT be reported.
         *
         * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the reporting
         * of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.3
         */
        remainingTime: number;

        /**
         * Indicates the desired startup level for a device when it is supplied with power and this level shall be
         * reflected in the CurrentLevel attribute. The values of the StartUpCurrentLevel attribute are listed below:
         *
         * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentLevel attribute
         * shall return to its value prior to the restart.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.15
         */
        startUpCurrentLevel: number | null;

        /**
         * Indicates the minimum value of CurrentLevel that is capable of being assigned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.4
         */
        minLevel?: number;
    }

    /**
     * {@link LevelControl} supports these elements if it supports feature "NotLighting".
     */
    export interface NotLightingAttributes {
        /**
         * Indicates the minimum value of CurrentLevel that is capable of being assigned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.4
         */
        minLevel?: number;
    }

    /**
     * {@link LevelControl} supports these elements if it supports feature "Frequency".
     */
    export interface FrequencyAttributes {
        /**
         * Indicates the frequency at which the device is at CurrentLevel. A CurrentFrequency of 0 is unknown.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second, or
         *
         *   - At the start of the movement/transition, or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.6
         */
        currentFrequency: number;

        /**
         * Indicates the minimum value of CurrentFrequency that is capable of being assigned. MinFrequency shall be less
         * than or equal to MaxFrequency. A value of 0 indicates undefined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.7
         */
        minFrequency: number;

        /**
         * Indicates the maximum value of CurrentFrequency that is capable of being assigned. MaxFrequency shall be
         * greater than or equal to MinFrequency. A value of 0 indicates undefined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.8
         */
        maxFrequency: number;
    }

    /**
     * Attributes that may appear in {@link LevelControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current level of this device. The meaning of 'level' is device dependent.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second, or
         *
         *   - At the end of the movement/transition, or
         *
         *   - When it changes from null to any other value and vice versa.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.2
         */
        currentLevel: number | null;

        /**
         * Indicates the value that the CurrentLevel attribute is set to when the OnOff attribute of an On/Off cluster
         * on the same endpoint is set to TRUE, as a result of processing an On/Off cluster command. If the OnLevel
         * attribute is not implemented, or is set to the null value, it has no effect. For more details see Effect of
         * On/Off Commands on the CurrentLevel attribute.
         *
         * OnLevel represents a mandatory field that was previously not present or optional. Implementers should be
         * aware that older devices may not implement it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.11
         */
        onLevel: number | null;

        /**
         * Indicates the selected options of the device.
         *
         * The Options attribute is a bitmap that determines the default behavior of some cluster commands. Each command
         * that is dependent on the Options attribute shall first construct a temporary Options bitmap that is in effect
         * during the command processing. The temporary Options bitmap has the same format and meaning as the Options
         * attribute, but includes any bits that may be overridden by command fields.
         *
         * This attribute is meant to be changed only during commissioning.
         *
         * Command execution shall NOT continue beyond the Options processing if all of these criteria are true:
         *
         *   - The command is one of the ‘without On/Off’ commands: Move, Move to Level, Step, or Stop.
         *
         *   - The On/Off cluster exists on the same endpoint as this cluster.
         *
         *   - The OnOff attribute of the On/Off cluster, on this endpoint, is FALSE.
         *
         *   - The value of the ExecuteIfOff bit is 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.9
         */
        options: Options;

        /**
         * Indicates the maximum value of CurrentLevel that is capable of being assigned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.5
         */
        maxLevel: number;

        /**
         * Indicates the time taken to move to or from the target level when On or Off commands are received by an
         * On/Off cluster on the same endpoint. It is specified in 1/10ths of a second.
         *
         * The actual time taken SHOULD be as close to OnOffTransitionTime as the device is able. Please note that if
         * the device is not able to move at a variable rate, the OnOffTransitionTime attribute SHOULD NOT be
         * implemented.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.10
         */
        onOffTransitionTime: number;

        /**
         * Indicates the time taken to move the current level from the minimum level to the maximum level when an On
         * command is received by an On/Off cluster on the same endpoint. It is specified in 1/10ths of a second. If
         * this attribute is not implemented, or contains a null value, the OnOffTransitionTime shall be used instead.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.12
         */
        onTransitionTime: number | null;

        /**
         * Indicates the time taken to move the current level from the maximum level to the minimum level when an Off
         * command is received by an On/Off cluster on the same endpoint. It is specified in 1/10ths of a second. If
         * this attribute is not implemented, or contains a null value, the OnOffTransitionTime shall be used instead.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.13
         */
        offTransitionTime: number | null;

        /**
         * Indicates the movement rate, in units per second, when a Move command is received with a null value Rate
         * parameter.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.14
         */
        defaultMoveRate: number | null;

        /**
         * Indicates the time remaining until the current command is complete - it is specified in 1/10ths of a second.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - When it changes from 0 to any value higher than 10, or
         *
         *   - When it changes, with a delta larger than 10, caused by the invoke of a command, or
         *
         *   - When it changes to 0.
         *
         * For commands with a transition time or changes to the transition time less than 1 second, changes to this
         * attribute shall NOT be reported.
         *
         * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the reporting
         * of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.3
         */
        remainingTime: number;

        /**
         * Indicates the desired startup level for a device when it is supplied with power and this level shall be
         * reflected in the CurrentLevel attribute. The values of the StartUpCurrentLevel attribute are listed below:
         *
         * This behavior does not apply to reboots associated with OTA. After an OTA restart, the CurrentLevel attribute
         * shall return to its value prior to the restart.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.15
         */
        startUpCurrentLevel: number | null;

        /**
         * Indicates the minimum value of CurrentLevel that is capable of being assigned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.4
         */
        minLevel: number;

        /**
         * Indicates the frequency at which the device is at CurrentLevel. A CurrentFrequency of 0 is unknown.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - At most once per second, or
         *
         *   - At the start of the movement/transition, or
         *
         *   - At the end of the movement/transition.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.6
         */
        currentFrequency: number;

        /**
         * Indicates the minimum value of CurrentFrequency that is capable of being assigned. MinFrequency shall be less
         * than or equal to MaxFrequency. A value of 0 indicates undefined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.7
         */
        minFrequency: number;

        /**
         * Indicates the maximum value of CurrentFrequency that is capable of being assigned. MaxFrequency shall be
         * greater than or equal to MinFrequency. A value of 0 indicates undefined.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.6.8
         */
        maxFrequency: number;
    }

    /**
     * {@link LevelControl} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.1
         */
        moveToLevel(request: MoveToLevelRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2
         */
        move(request: MoveRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3
         */
        step(request: StepRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.4
         */
        stop(request: StopRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        moveToLevelWithOnOff(request: MoveToLevelRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        moveWithOnOff(request: MoveRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        stepWithOnOff(request: StepRequest): MaybePromise;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7
         */
        stopWithOnOff(request: StopRequest): MaybePromise;
    }

    /**
     * {@link LevelControl} supports these elements if it supports feature "Frequency".
     */
    export interface FrequencyCommands {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.5
         */
        moveToClosestFrequency(request: MoveToClosestFrequencyRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link LevelControl}.
     */
    export interface Commands extends
        BaseCommands,
        FrequencyCommands
    {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        { flags: { lighting: true }, attributes: LightingAttributes },
        { flags: { lighting: false }, attributes: NotLightingAttributes },
        { flags: { frequency: true }, attributes: FrequencyAttributes, commands: FrequencyCommands }
    ];

    export type Features = "OnOff" | "Lighting" | "Frequency";

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
         * This feature supports an interface for controlling the level of a light source.
         *
         * For the CurrentLevel attribute:
         *
         * A value of 0x00 shall NOT be used.
         *
         * A value of 0x01 shall indicate the minimum level that can be attained on a device.
         *
         * A value of 0xFE shall indicate the maximum level that can be attained on a device.
         *
         * A value of null shall represent an undefined value.
         *
         * All other values are application specific gradations from the minimum to the maximum level.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.4.2
         */
        Lighting = "Lighting",

        /**
         * Frequency (FQ)
         *
         * > [!NOTE]
         *
         * > The Frequency feature is provisional.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.4.3
         */
        Frequency = "Frequency"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.1
     */
    export declare class Options {
        constructor(values?: Partial<Options> | number);

        /**
         * Dependency on On/Off cluster
         *
         * This bit indicates if this cluster has a dependency with the On/Off cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.1.1
         */
        executeIfOff?: boolean;

        /**
         * Dependency on Color Control cluster
         *
         * This bit indicates if this cluster has a dependency with the Color Control cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.5.1.2
         */
        coupleColorTempToLevel?: boolean;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.1
     */
    export declare class MoveToLevelRequest {
        constructor(values?: Partial<MoveToLevelRequest>);
        level: number;
        transitionTime: number | null;
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2
     */
    export declare class MoveRequest {
        constructor(values?: Partial<MoveRequest>);

        /**
         * This field shall be one of the non-reserved values in MoveModeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2.1
         */
        moveMode: MoveMode;

        /**
         * This field shall indicate the rate of movement in units per second. The actual rate of movement SHOULD be as
         * close to this rate as the device is able. If the Rate field is null, then the value of the DefaultMoveRate
         * attribute shall be used if that attribute is supported and its value is not null. If the Rate field is null
         * and the DefaultMoveRate attribute is either not supported or set to null, then the device SHOULD move as fast
         * as it is able. If the device is not able to move at a variable rate, this field may be disregarded.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.2.2
         */
        rate: number | null;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3
     */
    export declare class StepRequest {
        constructor(values?: Partial<StepRequest>);

        /**
         * This field shall be one of the non-reserved values in StepModeEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3.1
         */
        stepMode: StepMode;

        /**
         * This field shall indicate the change to CurrentLevel.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3.2
         */
        stepSize: number;

        /**
         * This field shall indicate the time that shall be taken to perform the step, in tenths of a second. A step is
         * a change in the CurrentLevel of StepSize units. The actual time taken SHOULD be as close to this as the
         * device is able. If the TransitionTime field is equal to null, the device SHOULD move as fast as it is able.
         *
         * If the device is not able to move at a variable rate, the TransitionTime field may be disregarded.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.3.3
         */
        transitionTime: number | null;

        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.4
     */
    export declare class StopRequest {
        constructor(values?: Partial<StopRequest>);
        optionsMask: Options;
        optionsOverride: Options;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 1.6.7.5
     */
    export declare class MoveToClosestFrequencyRequest {
        constructor(values?: Partial<MoveToClosestFrequencyRequest>);
        frequency: number;
    };

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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link LevelControl}.
     */
    export const Cluster: ClusterType.WithCompat<typeof LevelControl, LevelControl>;

    /**
     * @deprecated Use {@link LevelControl}.
     */
    export const Complete: typeof LevelControl;

    export const Typing: LevelControl;
}

/**
 * @deprecated Use {@link LevelControl}.
 */
export declare const LevelControlCluster: typeof LevelControl;

export interface LevelControl extends ClusterTyping {
    Attributes: LevelControl.Attributes;
    Commands: LevelControl.Commands;
    Features: LevelControl.Features;
    Components: LevelControl.Components;
}
