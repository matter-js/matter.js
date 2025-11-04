/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Command, TlvNoResponse, Attribute, OptionalCommand, Event } from "../cluster/Cluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvUInt32, TlvBitmap } from "../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace DishwasherAlarm {
    /**
     * These are optional features supported by DishwasherAlarmCluster.
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
     * @see {@link MatterSpecification.v142.Cluster} § 8.4.4.1
     */
    export const Alarm = {
        /**
         * Water inflow is abnormal
         */
        inflowError: BitFlag(0),

        /**
         * Water draining is abnormal
         */
        drainError: BitFlag(1),

        /**
         * Door or door lock is abnormal
         */
        doorError: BitFlag(2),

        /**
         * Unable to reach normal temperature
         */
        tempTooLow: BitFlag(3),

        /**
         * Temperature is too high
         */
        tempTooHigh: BitFlag(4),

        /**
         * Water level is abnormal
         */
        waterLevelError: BitFlag(5)
    };

    /**
     * Input to the DishwasherAlarm reset command
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
     * Input to the DishwasherAlarm reset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
     */
    export interface ResetRequest extends TypeFromSchema<typeof TlvResetRequest> {}

    /**
     * Input to the DishwasherAlarm modifyEnabledAlarms command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
     */
    export const TlvModifyEnabledAlarmsRequest = TlvObject({
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
        mask: TlvField(0, TlvBitmap(TlvUInt32, Alarm))
    });

    /**
     * Input to the DishwasherAlarm modifyEnabledAlarms command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
     */
    export interface ModifyEnabledAlarmsRequest extends TypeFromSchema<typeof TlvModifyEnabledAlarmsRequest> {}

    /**
     * Body of the DishwasherAlarm notify event
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
     * Body of the DishwasherAlarm notify event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
     */
    export interface NotifyEvent extends TypeFromSchema<typeof TlvNotifyEvent> {}

    /**
     * A DishwasherAlarmCluster supports these elements if it supports feature Reset.
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
     * These elements and properties are present in all DishwasherAlarm clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x5d,
        name: "DishwasherAlarm",
        revision: 1,

        features: {
            /**
             * This feature indicates that alarms can be reset via the Reset command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.4.1
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

        commands: {
            /**
             * This command allows a client to request that an alarm be enabled or suppressed at the server.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
             */
            modifyEnabledAlarms: OptionalCommand(0x1, TlvModifyEnabledAlarmsRequest, 0x1, TlvNoResponse)
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
         * This metadata controls which DishwasherAlarmCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { reset: true }, component: ResetComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster is a derived cluster of the Alarm Base cluster and provides the alarm definition related to
     * dishwasher devices.
     *
     * DishwasherAlarmCluster supports optional features that you can enable with the DishwasherAlarmCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 8.4
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
        commands: {
            ...Cluster.commands,
            reset: MutableCluster.AsConditional(ResetComponent.commands.reset, { mandatoryIf: [RESET] })
        },
        events: Cluster.events
    });

    /**
     * This cluster supports all DishwasherAlarm features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type DishwasherAlarmCluster = DishwasherAlarm.Cluster;
export const DishwasherAlarmCluster = DishwasherAlarm.Cluster;
ClusterRegistry.register(DishwasherAlarm.Complete);
