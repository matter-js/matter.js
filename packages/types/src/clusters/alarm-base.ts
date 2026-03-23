/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { AlarmBase as AlarmBaseModel } from "@matter/model";

/**
 * Definitions for the AlarmBase cluster.
 */
export namespace AlarmBase {
    /**
     * {@link AlarmBase} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
             */
            readonly mask: number;

            /**
             * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the
             * alarm is active, otherwise the alarm is inactive.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
             */
            readonly state: number;

            /**
             * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
             * means the alarm is supported, otherwise the alarm is not supported.
             *
             * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
             */
            readonly supported: number;
        }

        export interface Commands {
            /**
             * This command allows a client to request that an alarm be enabled or suppressed at the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
             */
            modifyEnabledAlarms(request: ModifyEnabledAlarmsRequest): MaybePromise;
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
     * {@link AlarmBase} supports these elements if it supports feature "Reset".
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
            readonly latch: number;
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

    /**
     * Attributes that may appear in {@link AlarmBase}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be enabled.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
         */
        readonly mask: number;

        /**
         * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the alarm is
         * active, otherwise the alarm is inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
         */
        readonly state: number;

        /**
         * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
         * means the alarm is supported, otherwise the alarm is not supported.
         *
         * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
         */
        readonly supported: number;

        /**
         * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm will
         * be latched when set, and will not reset to inactive when the underlying condition which caused the alarm is
         * no longer present, and so requires an explicit reset using the Reset command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.2
         */
        readonly latch: number;
    }

    export interface Commands extends Base.Commands, ResetComponent.Commands {}

    /**
     * Events that may appear in {@link AlarmBase}.
     *
     * Device support for events may be affected by a device's supported {@link Features}.
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
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands, events: Base.Events },
        { flags: { reset: true }, attributes: ResetComponent.Attributes, commands: ResetComponent.Commands }
    ];
    export type Features = "Reset";

    /**
     * These are optional features supported by AlarmBaseCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.4
     */
    export enum Feature {
        /**
         * Reset (RESET)
         *
         * This feature indicates that alarms can be reset via the Reset command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.4.1
         */
        Reset = "Reset"
    }

    /**
     * This command allows a client to request that an alarm be enabled or suppressed at the server.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
     */
    export interface ModifyEnabledAlarmsRequest {
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
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2.1
         */
        mask: number;
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
        active: number;

        /**
         * This field shall indicate those alarms that have become inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.2
         */
        inactive: number;

        /**
         * This field shall be a copy of the new State attribute value that resulted in the event being generated. That
         * is, this field shall have all the bits in Active set and shall NOT have any of the bits in Inactive set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.4
         */
        state: number;

        /**
         * This field shall be a copy of the Mask attribute when this event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.3
         */
        mask: number;
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
        alarms: number;
    }

    export const name = "AlarmBase" as const;
    export const revision = 2;
    export const schema = AlarmBaseModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `AlarmBase` instead of `AlarmBase.Complete`)
     */
    export type Complete = typeof AlarmBase;

    export declare const Complete: Complete;
    export declare const Typing: AlarmBase;
}

ClusterNamespace.define(AlarmBase);
export interface AlarmBase extends ClusterTyping { Attributes: AlarmBase.Attributes; Commands: AlarmBase.Commands; Events: AlarmBase.Events; Features: AlarmBase.Features; Components: AlarmBase.Components }
