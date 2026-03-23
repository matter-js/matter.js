/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { RefrigeratorAlarm as RefrigeratorAlarmModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the RefrigeratorAlarm cluster.
 */
export declare namespace RefrigeratorAlarm {
    /**
     * {@link RefrigeratorAlarm} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
             */
            readonly mask: Alarm;

            /**
             * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the
             * alarm is active, otherwise the alarm is inactive.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
             */
            readonly state: Alarm;

            /**
             * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
             * means the alarm is supported, otherwise the alarm is not supported.
             *
             * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
             */
            readonly supported: Alarm;
        }

        export interface Events {
            /**
             * This event shall be generated when one or more alarms change state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
             */
            notify: NotifyEvent;
        }
    }

    /**
     * {@link RefrigeratorAlarm} supports these elements if it supports feature "Reset".
     */
    export namespace ResetComponent {
        export interface Attributes {
            /**
             * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm
             * will be latched when set, and will not reset to inactive when the underlying condition which caused the
             * alarm is no longer present, and so requires an explicit reset using the Reset command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.2
             */
            readonly latch: Alarm;
        }

        export interface Commands {
            /**
             * This command resets active and latched alarms (if possible). Any generated Notify event shall contain
             * fields that represent the state of the server after the command has been processed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
             */
            reset(request: ResetRequest): MaybePromise;
        }
    }

    export interface Attributes extends Base.Attributes, Partial<ResetComponent.Attributes> {}
    export interface Commands extends ResetComponent.Commands {}
    export interface Events extends Base.Events {}
    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        { flags: { reset: true }, attributes: ResetComponent.Attributes, commands: ResetComponent.Commands }
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
    export interface Alarm {
        /**
         * The cabinet’s door has been open for a vendor defined amount of time.
         */
        doorOpen?: boolean;
    }

    /**
     * This event shall be generated when one or more alarms change state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
     */
    export interface NotifyEvent {
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
    }

    /**
     * This command resets active and latched alarms (if possible). Any generated Notify event shall contain fields that
     * represent the state of the server after the command has been processed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
     */
    export interface ResetRequest {
        /**
         * This field shall indicate a bitmap where each bit set in this field corresponds to an alarm that shall be
         * reset to inactive in the State attribute unless the alarm definition requires manual intervention. If the
         * alarms indicated are successfully reset, the response status code shall be SUCCESS, otherwise, the response
         * status code shall be FAILURE.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1.1
         */
        alarms: Alarm;
    }

    export const id: ClusterId;
    export const name: "RefrigeratorAlarm";
    export const revision: 1;
    export const schema: typeof RefrigeratorAlarmModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export const events: EventObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof RefrigeratorAlarm;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `RefrigeratorAlarm` instead of `RefrigeratorAlarm.Complete`)
     */
    export const Complete: typeof RefrigeratorAlarm;

    export const Typing: RefrigeratorAlarm;
}

export declare const RefrigeratorAlarmCluster: typeof RefrigeratorAlarm;
export interface RefrigeratorAlarm extends ClusterTyping { Attributes: RefrigeratorAlarm.Attributes; Commands: RefrigeratorAlarm.Commands; Events: RefrigeratorAlarm.Events; Features: RefrigeratorAlarm.Features; Components: RefrigeratorAlarm.Components }
