/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Command, TlvNoResponse, Attribute, OptionalCommand, Event } from "../cluster/Cluster.js";
import { TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";

export namespace AlarmBase {
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
     * Input to the AlarmBase reset command
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
        alarms: TlvField(0, TlvUInt32)
    });

    /**
     * Input to the AlarmBase reset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.1
     */
    export interface ResetRequest extends TypeFromSchema<typeof TlvResetRequest> {}

    /**
     * Input to the AlarmBase modifyEnabledAlarms command
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
        mask: TlvField(0, TlvUInt32)
    });

    /**
     * Input to the AlarmBase modifyEnabledAlarms command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.7.2
     */
    export interface ModifyEnabledAlarmsRequest extends TypeFromSchema<typeof TlvModifyEnabledAlarmsRequest> {}

    /**
     * Body of the AlarmBase notify event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
     */
    export const TlvNotifyEvent = TlvObject({
        /**
         * This field shall indicate those alarms that have become active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.1
         */
        active: TlvField(0, TlvUInt32),

        /**
         * This field shall indicate those alarms that have become inactive.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.2
         */
        inactive: TlvField(1, TlvUInt32),

        /**
         * This field shall be a copy of the new State attribute value that resulted in the event being generated. That
         * is, this field shall have all the bits in Active set and shall NOT have any of the bits in Inactive set.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.4
         */
        state: TlvField(2, TlvUInt32),

        /**
         * This field shall be a copy of the Mask attribute when this event was generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1.3
         */
        mask: TlvField(3, TlvUInt32)
    });

    /**
     * Body of the AlarmBase notify event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 1.15.8.1
     */
    export interface NotifyEvent extends TypeFromSchema<typeof TlvNotifyEvent> {}

    /**
     * A AlarmBaseCluster supports these elements if it supports feature Reset.
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
            latch: FixedAttribute(0x1, TlvUInt32)
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
     * AlarmBase is a derived cluster, not to be used directly. These elements are present in all clusters derived from
     * AlarmBase.
     */
    export const Base = MutableCluster.Component({
        features: {
            /**
             * This feature indicates that alarms can be reset via the Reset command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.4.1
             */
            reset: BitFlag(0)
        },

        name: "AlarmBase",
        revision: 2,

        attributes: {
            /**
             * Indicates a bitmap where each bit set in the Mask attribute corresponds to an alarm that shall be
             * enabled.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.1
             */
            mask: Attribute(0x0, TlvUInt32),

            /**
             * Indicates a bitmap where each bit shall represent the state of an alarm. The value of true means the
             * alarm is active, otherwise the alarm is inactive.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.3
             */
            state: Attribute(0x2, TlvUInt32),

            /**
             * Indicates a bitmap where each bit shall represent whether or not an alarm is supported. The value of true
             * means the alarm is supported, otherwise the alarm is not supported.
             *
             * If an alarm is not supported, the corresponding bit in Mask, Latch, and State shall be false.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 1.15.6.4
             */
            supported: FixedAttribute(0x3, TlvUInt32)
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
         * This metadata controls which AlarmBaseCluster elements matter.js activates for specific feature combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { reset: true }, component: ResetComponent })
    });

    const RESET = { reset: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster.Component({
        name: Base.name,
        revision: Base.revision,
        features: Base.features,
        attributes: {
            ...Base.attributes,
            latch: MutableCluster.AsConditional(ResetComponent.attributes.latch, { mandatoryIf: [RESET] })
        },
        commands: {
            ...Base.commands,
            reset: MutableCluster.AsConditional(ResetComponent.commands.reset, { mandatoryIf: [RESET] })
        },
        events: Base.events
    });

    /**
     * This cluster supports all AlarmBase features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}
