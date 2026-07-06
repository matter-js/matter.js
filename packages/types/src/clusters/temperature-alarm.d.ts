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
 * Definitions for the TemperatureAlarm cluster.
 *
 * This cluster is a derived cluster of Alarm Base cluster and provides the alarm definition related to temperature
 * measurements.
 *
 * > [!NOTE]
 *
 * > NOTE: Support for this cluster is provisional.
 *
 * @see {@link MatterSpecification.v16.Cluster} § 2.17
 */
export declare namespace TemperatureAlarm {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0064;

    /**
     * Textual cluster identifier.
     */
    export const name: "TemperatureAlarm";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v16.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the TemperatureAlarm cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link TemperatureAlarm} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.1
         */
        mask: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.3
         */
        state: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.4
         */
        supported: Alarm;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "OverTemperature".
     */
    export interface OverTemperatureAttributes {
        /**
         * Indicates the threshold for temperature measurement over which the CriticalOverTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.1
         */
        criticalOverTemperatureThreshold: number;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "OverTemperatureAndMajorThreshold".
     */
    export interface OverTemperatureAndMajorThresholdAttributes {
        /**
         * Indicates the threshold for temperature measurement over which the MajorOverTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.2
         */
        majorOverTemperatureThreshold: number;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "OverTemperatureAndMinorThreshold".
     */
    export interface OverTemperatureAndMinorThresholdAttributes {
        /**
         * Indicates the threshold for temperature measurement over which the MinorOverTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.3
         */
        minorOverTemperatureThreshold: number;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "UnderTemperatureAndMinorThreshold".
     */
    export interface UnderTemperatureAndMinorThresholdAttributes {
        /**
         * Indicates the threshold for temperature measurement under which the MinorUnderTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.4
         */
        minorUnderTemperatureThreshold: number;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "UnderTemperatureAndMajorThreshold".
     */
    export interface UnderTemperatureAndMajorThresholdAttributes {
        /**
         * Indicates the threshold for temperature measurement under which the MajorUnderTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.5
         */
        majorUnderTemperatureThreshold: number;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "UnderTemperature".
     */
    export interface UnderTemperatureAttributes {
        /**
         * Indicates the threshold for temperature measurement under which the CriticalUnderTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.6
         */
        criticalUnderTemperatureThreshold: number;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "Reset".
     */
    export interface ResetAttributes {
        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.2
         */
        latch: Alarm;
    }

    /**
     * Attributes that may appear in {@link TemperatureAlarm}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.1
         */
        mask: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.3
         */
        state: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.4
         */
        supported: Alarm;

        /**
         * Indicates the threshold for temperature measurement over which the CriticalOverTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.1
         */
        criticalOverTemperatureThreshold: number;

        /**
         * Indicates the threshold for temperature measurement over which the MajorOverTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.2
         */
        majorOverTemperatureThreshold: number;

        /**
         * Indicates the threshold for temperature measurement over which the MinorOverTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.3
         */
        minorOverTemperatureThreshold: number;

        /**
         * Indicates the threshold for temperature measurement under which the MinorUnderTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.4
         */
        minorUnderTemperatureThreshold: number;

        /**
         * Indicates the threshold for temperature measurement under which the MajorUnderTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.5
         */
        majorUnderTemperatureThreshold: number;

        /**
         * Indicates the threshold for temperature measurement under which the CriticalUnderTemperature alarm shall be
         * active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.6.6
         */
        criticalUnderTemperatureThreshold: number;

        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.6.2
         */
        latch: Alarm;
    }

    /**
     * {@link TemperatureAlarm} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command allows a client to request that an alarm be enabled or suppressed at the server.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.7.2
         */
        modifyEnabledAlarms(request: ModifyEnabledAlarmsRequest): MaybePromise;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature
     * "OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustable".
     */
    export interface OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands {
        /**
         * This command will set the alarm thresholds for the specified values.
         *
         * > [!NOTE]
         *
         * > NOTE: The constraints related to the field values in the table above shall have the relationship as
         *   represented by the illustration below:
         *
         * !TemperatureAlarm Thresholds
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1
         */
        setTemperatureAlarmThresholds(request: SetTemperatureAlarmThresholdsRequest): MaybePromise;
    }

    /**
     * {@link TemperatureAlarm} supports these elements if it supports feature "Reset".
     */
    export interface ResetCommands {
        /**
         * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields
         * that represent the state of the server after the command has been processed.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.7.1
         */
        reset(request: ResetRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link TemperatureAlarm}.
     */
    export interface Commands extends
        BaseCommands,
        OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands,
        ResetCommands
    {}

    /**
     * {@link TemperatureAlarm} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when one or more alarms change state.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1
         */
        notify: NotifyEvent;
    }

    /**
     * Events that may appear in {@link TemperatureAlarm}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when one or more alarms change state.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1
         */
        notify: NotifyEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { overTemperature: true }, attributes: OverTemperatureAttributes },
        {
            flags: { overTemperature: true, majorThreshold: true },
            attributes: OverTemperatureAndMajorThresholdAttributes
        },
        {
            flags: { overTemperature: true, minorThreshold: true },
            attributes: OverTemperatureAndMinorThresholdAttributes
        },
        {
            flags: { underTemperature: true, minorThreshold: true },
            attributes: UnderTemperatureAndMinorThresholdAttributes
        },
        {
            flags: { underTemperature: true, majorThreshold: true },
            attributes: UnderTemperatureAndMajorThresholdAttributes
        },
        { flags: { underTemperature: true }, attributes: UnderTemperatureAttributes },
        {
            flags: { overCriticalAdjustable: true },
            commands: OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands
        },
        {
            flags: { overMajorAdjustable: true },
            commands: OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands
        },
        {
            flags: { overMinorAdjustable: true },
            commands: OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands
        },
        {
            flags: { underMinorAdjustable: true },
            commands: OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands
        },
        {
            flags: { underMajorAdjustable: true },
            commands: OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands
        },
        {
            flags: { underCriticalAdjustable: true },
            commands: OverCriticalAdjustableOrOverMajorAdjustableOrOverMinorAdjustableOrUnderMinorAdjustableOrUnderMajorAdjustableOrUnderCriticalAdjustableCommands
        },
        { flags: { reset: true }, attributes: ResetAttributes, commands: ResetCommands }
    ];

    export type Features = "OverTemperature" | "UnderTemperature" | "MajorThreshold" | "MinorThreshold" | "OverCriticalAdjustable" | "OverMajorAdjustable" | "OverMinorAdjustable" | "UnderMinorAdjustable" | "UnderMajorAdjustable" | "UnderCriticalAdjustable" | "Reset";

    /**
     * These are optional features supported by TemperatureAlarmCluster.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.17.4
     */
    export enum Feature {
        /**
         * OverTemperature (OVER)
         *
         * Supports activating alarms when a temperature measurement goes over a threshold
         */
        OverTemperature = "OverTemperature",

        /**
         * UnderTemperature (UNDER)
         *
         * Supports activating alarms when a temperature measurement goes under a threshold
         */
        UnderTemperature = "UnderTemperature",

        /**
         * MajorThreshold (MAJOR)
         *
         * Supports the major threshold for alarms
         */
        MajorThreshold = "MajorThreshold",

        /**
         * MinorThreshold (MINOR)
         *
         * Supports the minor threshold for alarms
         */
        MinorThreshold = "MinorThreshold",

        /**
         * OverCriticalAdjustable (OCRIADJ)
         *
         * Supports the ability to adjust the over critical temperature threshold
         */
        OverCriticalAdjustable = "OverCriticalAdjustable",

        /**
         * OverMajorAdjustable (OMAJADJ)
         *
         * Supports the ability to adjust the over major temperature threshold
         */
        OverMajorAdjustable = "OverMajorAdjustable",

        /**
         * OverMinorAdjustable (OMINADJ)
         *
         * Supports the ability to adjust the over minor temperature threshold
         */
        OverMinorAdjustable = "OverMinorAdjustable",

        /**
         * UnderMinorAdjustable (UMINADJ)
         *
         * Supports the ability to adjust the under minor temperature threshold
         */
        UnderMinorAdjustable = "UnderMinorAdjustable",

        /**
         * UnderMajorAdjustable (UMAJADJ)
         *
         * Supports the ability to adjust the under major temperature threshold
         */
        UnderMajorAdjustable = "UnderMajorAdjustable",

        /**
         * UnderCriticalAdjustable (UCRIADJ)
         *
         * Supports the ability to adjust the under critical temperature threshold
         */
        UnderCriticalAdjustable = "UnderCriticalAdjustable",

        /**
         * Reset (RESET)
         *
         * This feature indicates that alarms can be reset via the Reset command.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.4.1
         */
        Reset = "Reset"
    }

    /**
     * @see {@link MatterSpecification.v16.Cluster} § 2.17.5.1
     */
    export class Alarm {
        constructor(values?: Partial<Alarm> | number);

        /**
         * The measured temperature is above the critical threshold.
         */
        criticalOverTemperatureAlarm?: boolean;

        /**
         * The measured temperature is above the major threshold.
         */
        majorOverTemperatureAlarm?: boolean;

        /**
         * The measured temperature is above the minor threshold.
         */
        minorOverTemperatureAlarm?: boolean;

        /**
         * The measured temperature is below the minor threshold.
         */
        minorUnderTemperatureAlarm?: boolean;

        /**
         * The measured temperature is below the major threshold.
         */
        majorUnderTemperatureAlarm?: boolean;

        /**
         * The measured temperature is below the critical threshold.
         */
        criticalUnderTemperatureAlarm?: boolean;
    }

    /**
     * This command allows a client to request that an alarm be enabled or suppressed at the server.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 1.15.7.2
     */
    export class ModifyEnabledAlarmsRequest {
        constructor(values?: Partial<ModifyEnabledAlarmsRequest>);

        /**
         * This field shall indicate a bitmap where each bit set in the this field corresponds to an alarm that SHOULD
         * be enabled or suppressed. A value of 1 shall indicate that the alarm SHOULD be enabled while a value of 0
         * shall indicate that the alarm SHOULD be suppressed.
         *
         * A server that receives this command with a Mask that includes bits that are set for unknown alarms shall
         * respond with a status code of INVALID_COMMAND.
         *
         * A server that receives this command with a Mask that includes bits that are set for alarms which are not
         * supported, as indicated in the Supported attribute, shall respond with a status code of INVALID_COMMAND.
         *
         * A server that is unable to enable a currently suppressed alarm, or is unable to suppress a currently enabled
         * alarm shall respond with a status code of FAILURE; otherwise the server shall respond with a status code of
         * SUCCESS.
         *
         * On a SUCCESS case, the server shall also change the value of the Mask attribute to the value of the Mask
         * field from this command. After that the server shall also update the value of its State attribute to reflect
         * the status of the new alarm set as indicated by the new value of the Mask attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.7.2.1
         */
        mask: Alarm;
    }

    /**
     * This command will set the alarm thresholds for the specified values.
     *
     * > [!NOTE]
     *
     * > NOTE: The constraints related to the field values in the table above shall have the relationship as represented
     *   by the illustration below:
     *
     * !TemperatureAlarm Thresholds
     *
     * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1
     */
    export class SetTemperatureAlarmThresholdsRequest {
        constructor(values?: Partial<SetTemperatureAlarmThresholdsRequest>);

        /**
         * This field shall specify the new value of the CriticalOverTemperatureThreshold attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1.1
         */
        criticalOverTemperatureThreshold?: number;

        /**
         * This field shall specify the new value of the MajorOverTemperatureThreshold attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1.2
         */
        majorOverTemperatureThreshold?: number;

        /**
         * This field shall specify the new value of the MinorOverTemperatureThreshold attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1.3
         */
        minorOverTemperatureThreshold?: number;

        /**
         * This field shall specify the new value of the MinorUnderTemperatureThreshold attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1.4
         */
        minorUnderTemperatureThreshold?: number;

        /**
         * This field shall specify the new value of the MajorUnderTemperatureThreshold attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1.5
         */
        majorUnderTemperatureThreshold?: number;

        /**
         * This field shall specify the new value of the CriticalUnderTemperatureThreshold attribute.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 2.17.7.1.6
         */
        criticalUnderTemperatureThreshold?: number;
    }

    /**
     * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields that
     * represent the state of the server after the command has been processed.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 1.15.7.1
     */
    export class ResetRequest {
        constructor(values?: Partial<ResetRequest>);

        /**
         * This field shall indicate a bitmap where each bit set in this field corresponds to an alarm that shall be
         * reset to inactive in the State attribute unless the alarm definition requires manual intervention. If the
         * alarms indicated are successfully reset, the response status code shall be SUCCESS, otherwise, the response
         * status code shall be FAILURE.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.7.1.1
         */
        alarms: Alarm;
    }

    /**
     * This event shall be generated when one or more alarms change state.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1
     */
    export class NotifyEvent {
        constructor(values?: Partial<NotifyEvent>);

        /**
         * This field shall indicate those alarms that have become active.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1.1
         */
        active: Alarm;

        /**
         * This field shall indicate those alarms that have become inactive.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1.2
         */
        inactive: Alarm;

        /**
         * This field shall be a copy of the new State attribute value that resulted in the event being generated. That
         * is, this field shall have all the bits in Active set and shall NOT have any of the bits in Inactive set.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1.4
         */
        state: Alarm;

        /**
         * This field shall be a copy of the Mask attribute when this event was generated.
         *
         * @see {@link MatterSpecification.v16.Cluster} § 1.15.8.1.3
         */
        mask: Alarm;
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
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link TemperatureAlarm}.
     */
    export const Cluster: ClusterType.WithCompat<typeof TemperatureAlarm, TemperatureAlarm>;

    /**
     * @deprecated Use {@link TemperatureAlarm}.
     */
    export const Complete: typeof TemperatureAlarm;

    export const Typing: TemperatureAlarm;
}

/**
 * @deprecated Use {@link TemperatureAlarm}.
 */
export declare const TemperatureAlarmCluster: typeof TemperatureAlarm;

export interface TemperatureAlarm extends ClusterTyping {
    Attributes: TemperatureAlarm.Attributes;
    Commands: TemperatureAlarm.Commands;
    Events: TemperatureAlarm.Events;
    Features: TemperatureAlarm.Features;
    Components: TemperatureAlarm.Components;
}
