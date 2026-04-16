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
 * Definitions for the RefrigeratorAlarm cluster.
 *
 * This cluster is a derived cluster of Alarm Base cluster and provides the alarm definition related to refrigerator and
 * temperature controlled cabinet devices.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 8.8
 */
export declare namespace RefrigeratorAlarm {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0057;

    /**
     * Textual cluster identifier.
     */
    export const name: "RefrigeratorAlarm";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the RefrigeratorAlarm cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link RefrigeratorAlarm} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
         */
        mask: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
         */
        state: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
         */
        supported: Alarm;
    }

    /**
     * {@link RefrigeratorAlarm} supports these elements if it supports feature "Reset".
     */
    export interface ResetAttributes {
        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.2
         */
        latch: Alarm;
    }

    /**
     * Attributes that may appear in {@link RefrigeratorAlarm}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
         */
        mask: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
         */
        state: Alarm;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
         */
        supported: Alarm;

        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.2
         */
        latch: Alarm;
    }

    /**
     * {@link RefrigeratorAlarm} supports these elements if it supports feature "Reset".
     */
    export interface ResetCommands {
        /**
         * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields
         * that represent the state of the server after the command has been processed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
         */
        reset(request: ResetRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link RefrigeratorAlarm}.
     */
    export interface Commands extends ResetCommands {}

    /**
     * {@link RefrigeratorAlarm} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when one or more alarms change state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
         */
        notify: NotifyEvent;
    }

    /**
     * Events that may appear in {@link RefrigeratorAlarm}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when one or more alarms change state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
         */
        notify: NotifyEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, events: BaseEvents },
        { flags: { reset: true }, attributes: ResetAttributes, commands: ResetCommands }
    ];
    export type Features = "Reset";

    /**
     * These are optional features supported by RefrigeratorAlarmCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.8.4
     */
    export enum Feature {
        /**
         * Reset (RESET)
         *
         * Supports the ability to reset alarms
         */
        Reset = "Reset"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 8.8.5.1
     */
    export declare class Alarm {
        constructor(values?: Partial<Alarm> | number);

        /**
         * The cabinet’s door has been open for a vendor defined amount of time.
         */
        doorOpen?: boolean;
    };

    /**
     * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields that
     * represent the state of the server after the command has been processed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
     */
    export declare class ResetRequest {
        constructor(values?: Partial<ResetRequest>);

        /**
         * This field shall indicate a bitmap where each bit set in this field corresponds to an alarm that shall be
         * reset to inactive in the State attribute unless the alarm definition requires manual intervention. If the
         * alarms indicated are successfully reset, the response status code shall be SUCCESS, otherwise, the response
         * status code shall be FAILURE.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1.1
         */
        alarms: Alarm;
    };

    /**
     * This event shall be generated when one or more alarms change state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
     */
    export declare class NotifyEvent {
        constructor(values?: Partial<NotifyEvent>);

        /**
         * This field shall indicate those alarms that have become active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.1
         */
        active: Alarm;

        /**
         * This field shall indicate those alarms that have become inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.2
         */
        inactive: Alarm;

        /**
         * This field shall be a copy of the new State attribute value that resulted in the event being generated. That
         * is, this field shall have all the bits in Active set and shall NOT have any of the bits in Inactive set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.4
         */
        state: Alarm;

        /**
         * This field shall be a copy of the Mask attribute when this event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.3
         */
        mask: Alarm;
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
     * @deprecated Use {@link RefrigeratorAlarm}.
     */
    export const Cluster: ClusterType.WithCompat<typeof RefrigeratorAlarm, RefrigeratorAlarm>;

    /**
     * @deprecated Use {@link RefrigeratorAlarm}.
     */
    export const Complete: typeof RefrigeratorAlarm;

    export const Typing: RefrigeratorAlarm;
}

/**
 * @deprecated Use {@link RefrigeratorAlarm}.
 */
export declare const RefrigeratorAlarmCluster: typeof RefrigeratorAlarm;

export interface RefrigeratorAlarm extends ClusterTyping {
    Attributes: RefrigeratorAlarm.Attributes;
    Commands: RefrigeratorAlarm.Commands;
    Events: RefrigeratorAlarm.Events;
    Features: RefrigeratorAlarm.Features;
    Components: RefrigeratorAlarm.Components;
}
