/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";

/**
 * Definitions for the AlarmBase cluster.
 *
 * This cluster is a base cluster from which clusters for particular alarms for a device type can be derived. Each
 * derivation shall define the values for the AlarmBitmap data type used in this cluster. Each derivation shall define
 * which alarms are latched.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 1.15
 */
export declare namespace AlarmBase {
    /**
     * Textual cluster identifier.
     */
    export const name: "AlarmBase";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 2;

    /**
     * Canonical metadata for the AlarmBase cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link AlarmBase} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.1
         */
        mask: number;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.3
         */
        state: number;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.4
         */
        supported: number;
    }

    /**
     * {@link AlarmBase} supports these elements if it supports feature "Reset".
     */
    export interface ResetAttributes {
        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.2
         */
        latch: number;
    }

    /**
     * Attributes that may appear in {@link AlarmBase}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.1
         */
        mask: number;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.3
         */
        state: number;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.4
         */
        supported: number;

        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.6.2
         */
        latch: number;
    }

    /**
     * {@link AlarmBase} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command allows a client to request that an alarm be enabled or suppressed at the server.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.7.2
         */
        modifyEnabledAlarms(request: ModifyEnabledAlarmsRequest): MaybePromise;
    }

    /**
     * {@link AlarmBase} supports these elements if it supports feature "Reset".
     */
    export interface ResetCommands {
        /**
         * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields
         * that represent the state of the server after the command has been processed.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.7.1
         */
        reset(request: ResetRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link AlarmBase}.
     */
    export interface Commands extends
        BaseCommands,
        ResetCommands
    {}

    /**
     * {@link AlarmBase} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when one or more alarms change state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1
         */
        notify: NotifyEvent;
    }

    /**
     * Events that may appear in {@link AlarmBase}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when one or more alarms change state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1
         */
        notify: NotifyEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { reset: true }, attributes: ResetAttributes, commands: ResetCommands }
    ];
    export type Features = "Reset";

    /**
     * These are optional features supported by AlarmBaseCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.15.4
     */
    export enum Feature {
        /**
         * Reset (RESET)
         *
         * This feature indicates that alarms can be reset via the Reset command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.4.1
         */
        Reset = "Reset"
    }

    /**
     * This command allows a client to request that an alarm be enabled or suppressed at the server.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.15.7.2
     */
    export declare class ModifyEnabledAlarmsRequest {
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
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.7.2.1
         */
        mask: number;
    };

    /**
     * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields that
     * represent the state of the server after the command has been processed.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.15.7.1
     */
    export declare class ResetRequest {
        constructor(values?: Partial<ResetRequest>);

        /**
         * This field shall indicate a bitmap where each bit set in this field corresponds to an alarm that shall be
         * reset to inactive in the State attribute unless the alarm definition requires manual intervention. If the
         * alarms indicated are successfully reset, the response status code shall be SUCCESS, otherwise, the response
         * status code shall be FAILURE.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.7.1.1
         */
        alarms: number;
    };

    /**
     * This event shall be generated when one or more alarms change state.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1
     */
    export declare class NotifyEvent {
        constructor(values?: Partial<NotifyEvent>);

        /**
         * This field shall indicate those alarms that have become active.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1.1
         */
        active: number;

        /**
         * This field shall indicate those alarms that have become inactive.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1.2
         */
        inactive: number;

        /**
         * This field shall be a copy of the new State attribute value that resulted in the event being generated. That
         * is, this field shall have all the bits in Active set and shall NOT have any of the bits in Inactive set.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1.4
         */
        state: number;

        /**
         * This field shall be a copy of the Mask attribute when this event was generated.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 1.15.8.1.3
         */
        mask: number;
    };

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
     * @deprecated Use {@link AlarmBase}.
     */
    export const Complete: typeof AlarmBase;

    export const Typing: AlarmBase;
}

export interface AlarmBase extends ClusterTyping {
    Attributes: AlarmBase.Attributes;
    Commands: AlarmBase.Commands;
    Events: AlarmBase.Events;
    Features: AlarmBase.Features;
    Components: AlarmBase.Components;
}
