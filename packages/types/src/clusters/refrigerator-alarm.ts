/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Command, TlvNoResponse, Attribute, Event } from "../cluster/Cluster.js";
import { TlvUInt32, TlvBitmap } from "../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity, MaybePromise } from "@matter/general";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { RefrigeratorAlarm as RefrigeratorAlarmModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the RefrigeratorAlarm cluster.
 */
export namespace RefrigeratorAlarm {
    /**
     * Attributes that may appear in {@link RefrigeratorAlarm}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
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

    export namespace Attributes {
        export type Components = [
            { flags: {}, mandatory: "mask" | "state" | "supported" },
            { flags: { reset: true }, mandatory: "latch" }
        ];
    }

    export interface Commands extends Commands.Reset {}

    export namespace Commands {
        /**
         * {@link RefrigeratorAlarm} supports these commands if it supports feature "Reset".
         */
        export interface Reset {
            /**
             * This command resets active and latched alarms (if possible). Any generated Notify event shall contain
             * fields that represent the state of the server after the command has been processed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
             */
            reset(request: ResetRequest): MaybePromise;
        }

        export type Components = [{ flags: { reset: true }, methods: Reset }];
    }

    /**
     * Events that may appear in {@link RefrigeratorAlarm}.
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

    export namespace Events {
        export type Components = [{ flags: {}, mandatory: "notify" }];
    }
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
    export const Alarm = {
        /**
         * The cabinet’s door has been open for a vendor defined amount of time.
         */
        doorOpen: BitFlag(0)
    };

    export interface Alarm {
        /**
         * The cabinet’s door has been open for a vendor defined amount of time.
         */
        doorOpen?: boolean;
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
     * Input to the RefrigeratorAlarm reset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
     */
    export const TlvResetRequest = TlvObject({
        /**
         * This field shall indicate a bitmap where each bit set in this field corresponds to an alarm that shall be
         * reset to inactive in the State attribute unless the alarm definition requires manual intervention. If the
         * alarms indicated are successfully reset, the response status code shall be SUCCESS, otherwise, the response
         * status code shall be FAILURE.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1.1
         */
        alarms: TlvField(0, TlvBitmap(TlvUInt32, Alarm))
    });

    /**
     * Body of the RefrigeratorAlarm notify event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
     */
    export const TlvNotifyEvent = TlvObject({
        /**
         * This field shall indicate those alarms that have become active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.1
         */
        active: TlvField(0, TlvBitmap(TlvUInt32, Alarm)),

        /**
         * This field shall indicate those alarms that have become inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.2
         */
        inactive: TlvField(1, TlvBitmap(TlvUInt32, Alarm)),

        /**
         * This field shall be a copy of the new State attribute value that resulted in the event being generated. That
         * is, this field shall have all the bits in Active set and shall NOT have any of the bits in Inactive set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.4
         */
        state: TlvField(2, TlvBitmap(TlvUInt32, Alarm)),

        /**
         * This field shall be a copy of the Mask attribute when this event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.3
         */
        mask: TlvField(3, TlvBitmap(TlvUInt32, Alarm))
    });

    /**
     * A RefrigeratorAlarmCluster supports these elements if it supports feature Reset.
     */
    export const ResetComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates a bitmap where each bit set in the Latch attribute shall indicate that the corresponding alarm
             * will be latched when set, and will not reset to inactive when the underlying condition which caused the
             * alarm is no longer present, and so requires an explicit reset using the Reset command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.2
             */
            latch: FixedAttribute(0x1, TlvBitmap(TlvUInt32, Alarm))
        },

        commands: {
            /**
             * This command resets active and latched alarms (if possible). Any generated Notify event shall contain
             * fields that represent the state of the server after the command has been processed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
             */
            reset: Command(0x0, TlvResetRequest, 0x0, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all RefrigeratorAlarm clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x57,
        name: "RefrigeratorAlarm",
        revision: 1,

        features: {
            /**
             * Supports the ability to reset alarms
             */
            reset: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
             */
            mask: Attribute(0x0, TlvBitmap(TlvUInt32, Alarm)),

            /**
             * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the
             * alarm is active, otherwise the alarm is inactive.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
             */
            state: Attribute(0x2, TlvBitmap(TlvUInt32, Alarm)),

            /**
             * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
             * means the alarm is supported, otherwise the alarm is not supported.
             *
             * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
             */
            supported: FixedAttribute(0x3, TlvBitmap(TlvUInt32, Alarm))
        },

        events: {
            /**
             * This event shall be generated when one or more alarms change state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
             */
            notify: Event(0x0, Priority.Info, TlvNotifyEvent)
        },

        /**
         * This metadata controls which RefrigeratorAlarmCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { reset: true }, component: ResetComponent },
            { flags: { reset: true }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster is a derived cluster of Alarm Base cluster and provides the alarm definition related to refrigerator
     * and temperature controlled cabinet devices.
     *
     * RefrigeratorAlarmCluster supports optional features that you can enable with the RefrigeratorAlarmCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.8
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const RESET = { reset: true };

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
            latch: MutableCluster.AsConditional(ResetComponent.attributes.latch, { mandatoryIf: [RESET] })
        },
        commands: { reset: MutableCluster.AsConditional(ResetComponent.commands.reset, { mandatoryIf: [RESET] }) },
        events: Cluster.events
    });

    /**
     * This cluster supports all RefrigeratorAlarm features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
    export const id = ClusterId(0x57);
    export const name = "RefrigeratorAlarm" as const;
    export const revision = 1;
    export const schema = RefrigeratorAlarmModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: RefrigeratorAlarm;
}

export type RefrigeratorAlarmCluster = RefrigeratorAlarm.Cluster;
export const RefrigeratorAlarmCluster = RefrigeratorAlarm.Cluster;
ClusterNamespace.define(RefrigeratorAlarm);
export interface RefrigeratorAlarm extends ClusterTyping { Attributes: RefrigeratorAlarm.Attributes & { Components: RefrigeratorAlarm.Attributes.Components }; Commands: RefrigeratorAlarm.Commands & { Components: RefrigeratorAlarm.Commands.Components }; Events: RefrigeratorAlarm.Events & { Components: RefrigeratorAlarm.Events.Components }; Features: RefrigeratorAlarm.Features }
