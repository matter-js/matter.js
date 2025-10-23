/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    Attribute,
    OptionalWritableAttribute,
    OptionalFixedAttribute,
    WritableAttribute,
    OptionalAttribute,
    Command,
    TlvNoResponse,
    OptionalEvent
} from "../cluster/Cluster.js";
import { TlvEpochUs, TlvPercent, TlvUInt8, TlvUInt32, TlvEnum, TlvUInt16, TlvBitmap } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvOptionalField, TlvObject, TlvField } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Priority } from "../globals/Priority.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ValveConfigurationAndControl {
    /**
     * These are optional features supported by ValveConfigurationAndControlCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.4
     */
    export enum Feature {
        /**
         * TimeSync (TS)
         *
         * This feature shall indicate that the valve uses Time Synchronization and UTC time to indicate duration and
         * auto close time.
         *
         * This feature shall NOT be supported unless the device supports the Time Synchronization cluster.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.4.1
         */
        TimeSync = "TimeSync",

        /**
         * Level (LVL)
         *
         * This feature shall indicate that the valve is capable of being adjusted to a specific position, as a
         * percentage, of its full range of motion.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.4.2
         */
        Level = "Level"
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.5.2
     */
    export enum ValveState {
        /**
         * Valve is in closed position
         */
        Closed = 0,

        /**
         * Valve is in open position
         */
        Open = 1,

        /**
         * Valve is transitioning between closed and open positions or between levels
         */
        Transitioning = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.5.1
     */
    export const ValveFault = {
        /**
         * Unspecified fault detected
         */
        generalFault: BitFlag(0),

        /**
         * Valve is blocked
         */
        blocked: BitFlag(1),

        /**
         * Valve has detected a leak
         */
        leaking: BitFlag(2),

        /**
         * No valve is connected to controller
         */
        notConnected: BitFlag(3),

        /**
         * Short circuit is detected
         */
        shortCircuit: BitFlag(4),

        /**
         * The available current has been exceeded
         */
        currentExceeded: BitFlag(5)
    };

    /**
     * Input to the ValveConfigurationAndControl open command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.8.1
     */
    export const TlvOpenRequest = TlvObject({
        /**
         * This field shall indicate the duration that the valve will remain open for this specific Open command.
         *
         * A value of null shall indicate the duration is not set, meaning that the valve will remain open until closed
         * by the user or some other automation.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.8.1.1
         */
        openDuration: TlvOptionalField(0, TlvNullable(TlvUInt32.bound({ min: 1 }))),

        /**
         * This field shall indicate the target level used for this specific Open command.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.8.1.2
         */
        targetLevel: TlvOptionalField(1, TlvPercent.bound({ min: 1 }))
    });

    /**
     * Input to the ValveConfigurationAndControl open command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.8.1
     */
    export interface OpenRequest extends TypeFromSchema<typeof TlvOpenRequest> {}

    /**
     * Body of the ValveConfigurationAndControl valveStateChanged event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.1
     */
    export const TlvValveStateChangedEvent = TlvObject({
        /**
         * This field shall indicate the new state of the valve.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.1.1
         */
        valveState: TlvField(0, TlvEnum<ValveState>()),

        /**
         * This field shall indicate the new level of the valve.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.1.2
         */
        valveLevel: TlvOptionalField(1, TlvPercent)
    });

    /**
     * Body of the ValveConfigurationAndControl valveStateChanged event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.1
     */
    export interface ValveStateChangedEvent extends TypeFromSchema<typeof TlvValveStateChangedEvent> {}

    /**
     * Body of the ValveConfigurationAndControl valveFault event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.2
     */
    export const TlvValveFaultEvent = TlvObject({
        /**
         * This field shall indicate the value of the ValveFault attribute, at the time this event is generated.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.2.1
         */
        valveFault: TlvField(0, TlvBitmap(TlvUInt16, ValveFault))
    });

    /**
     * Body of the ValveConfigurationAndControl valveFault event
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.2
     */
    export interface ValveFaultEvent extends TypeFromSchema<typeof TlvValveFaultEvent> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.6.1
     */
    export enum StatusCode {
        /**
         * The requested action could not be performed due to a fault on the valve.
         */
        FailureDueToFault = 2
    }

    /**
     * Thrown for cluster status code {@link StatusCode.FailureDueToFault}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6.6.1
     */
    export class FailureDueToFaultError extends StatusResponseError {
        constructor(
            message = "The requested action could not be performed due to a fault on the valve",
            code = Status.Failure,
            clusterCode = StatusCode.FailureDueToFault
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * A ValveConfigurationAndControlCluster supports these elements if it supports feature TimeSync.
     */
    export const TimeSyncComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the UTC time when the valve will close, depending on value of the OpenDuration attribute.
             *
             * Null:
             *
             *   • When OpenDuration is null, or
             *
             *   • When the valve does not have a synchronized UTCTime in the Time Synchronization cluster, or
             *
             *   • When the valve is closed.
             *
             * When the value of this attribute is earlier or equal to the current UTC time, the valve shall
             * automatically transition to its closed position. The behavior of transitioning to the closed position,
             * shall match the behavior described in the Close command.
             *
             * If this attribute is not null and the Time Synchronization cluster receives a SetUTCTime command,
             * modifying the current UTC time of the device, the value of this attribute shall be adjusted to match the
             * new UTC time plus the value of the RemainingDuration attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.3
             */
            autoCloseTime: Attribute(0x2, TlvNullable(TlvEpochUs))
        }
    });

    /**
     * A ValveConfigurationAndControlCluster supports these elements if it supports feature Level.
     */
    export const LevelComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the current level of the valve as a percentage value, between fully closed and fully open.
             * During a transition from one level to another level, the valve SHOULD keep this attribute updated to the
             * best of its ability, in order to represent the actual level of the valve during the movement.
             *
             * A value of 100 percent shall indicate the fully open position. A value of 0 percent shall indicate the
             * fully closed position.
             *
             * A value of null shall indicate that the current state is not known.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.7
             */
            currentLevel: Attribute(0x6, TlvNullable(TlvPercent)),

            /**
             * Indicates the target level of the valve as a percentage value, between fully closed and fully open.
             *
             * The interpretation of the percentage value is the same as for the CurrentLevel attribute.
             *
             * A value of null shall indicate that no target position is set, since the change of level is either done
             * or failed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.8
             */
            targetLevel: Attribute(0x7, TlvNullable(TlvPercent)),

            /**
             * Indicates the default value used for the TargetLevel attribute, when a valve transitions from the closed
             * to the open state, caused by an Open command, if a TargetLevel field is not present in the Open command.
             *
             * If the LevelStep attribute is present and the value of a write interaction to this attribute field is not
             * 100, the value shall be a supported value as defined by the LevelStep attribute, such that (Value
             * received in the write interaction) % (Value of LevelStep attribute) equals 0. If the resulting value is
             * not 0, the requested DefaultOpenLevel value is considered an unsupported value and a CONSTRAINT_ERROR
             * status shall be returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.9
             */
            defaultOpenLevel: OptionalWritableAttribute(
                0x8,
                TlvPercent.bound({ min: 1 }),
                { persistent: true, default: 100 }
            ),

            /**
             * Indicates the step size the valve can support.
             *
             * The step size defined by this attribute is counted from 0 and the final step towards 100 may be different
             * than what is defined in this attribute. For example, if the value of this attribute is 15, it results in
             * these target values being supported; 0, 15, 30, 45, 60, 75, 90 and 100.
             *
             * The values of 0 and 100 shall always be supported, regardless of the value of this attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.11
             */
            levelStep: OptionalFixedAttribute(0xa, TlvUInt8.bound({ min: 1, max: 50 }), { default: 1 })
        }
    });

    /**
     * These elements and properties are present in all ValveConfigurationAndControl clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x81,
        name: "ValveConfigurationAndControl",
        revision: 1,

        features: {
            /**
             * This feature shall indicate that the valve uses Time Synchronization and UTC time to indicate duration
             * and auto close time.
             *
             * This feature shall NOT be supported unless the device supports the Time Synchronization cluster.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.4.1
             */
            timeSync: BitFlag(0),

            /**
             * This feature shall indicate that the valve is capable of being adjusted to a specific position, as a
             * percentage, of its full range of motion.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.4.2
             */
            level: BitFlag(1)
        },

        attributes: {
            /**
             * Indicates the total duration, in seconds, for which the valve will remain open for this current opening.
             *
             * A value of null shall indicate the duration is not set, meaning that the valve will remain open until
             * closed by the user or some other automation.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.1
             */
            openDuration: Attribute(0x0, TlvNullable(TlvUInt32.bound({ min: 1 }))),

            /**
             * Indicates the default duration, in seconds, for which the valve will remain open, if the OpenDuration
             * field is not present in the Open command.
             *
             * A value of null shall indicate the duration is not set, meaning that the valve will remain open until
             * closed by the user or some other automation.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.2
             */
            defaultOpenDuration: WritableAttribute(0x1, TlvNullable(TlvUInt32.bound({ min: 1 })), { persistent: true }),

            /**
             * Indicates the remaining duration, in seconds, until the valve closes. Null:
             *
             *   • When OpenDuration is null, or
             *
             *   • When the valve is closed.
             *
             * The value of this attribute shall only be reported in the following cases:
             *
             *   • When it changes from null to any other value and vice versa, or
             *
             *   • When it changes to 0, or
             *
             *   • When it increases, or
             *
             *   • When the closing time changes.
             *
             * Meaning that clients SHOULD NOT rely on the reporting of this attribute in order to keep track of the
             * remaining duration, due to this attribute not being reported during regular countdown.
             *
             * When reading this attribute it shall return the remaining duration, in seconds, until the valve closes.
             *
             * When the value of this attribute counts down to 0, the valve shall automatically transition to its closed
             * position. The behavior of transitioning to the closed position shall match the behavior described in the
             * Close command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.4
             */
            remainingDuration: Attribute(0x3, TlvNullable(TlvUInt32)),

            /**
             * Indicates the current state of the valve.
             *
             * A value of null shall indicate that the current state is not known.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.5
             */
            currentState: Attribute(0x4, TlvNullable(TlvEnum<ValveState>())),

            /**
             * Indicates the target state, while changing the state, of the valve.
             *
             * A value of null shall indicate that no target position is set, since the change in state is either done
             * or failed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.6
             */
            targetState: Attribute(0x5, TlvNullable(TlvEnum<ValveState>())),

            /**
             * Indicates any faults registered by the valve.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.7.10
             */
            valveFault: OptionalAttribute(0x9, TlvBitmap(TlvUInt16, ValveFault))
        },

        commands: {
            /**
             * This command is used to set the valve to its open position.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.8.1
             */
            open: Command(0x0, TlvOpenRequest, 0x0, TlvNoResponse),

            /**
             * This command is used to set the valve to its closed position.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.8.2
             */
            close: Command(0x1, TlvNoArguments, 0x1, TlvNoResponse)
        },

        events: {
            /**
             * This event shall be generated when the valve state changed. For level changes, after the end of movement,
             * for state changes when the new state has been reached.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.1
             */
            valveStateChanged: OptionalEvent(0x0, Priority.Info, TlvValveStateChangedEvent),

            /**
             * This event shall be generated when the valve registers or clears a fault, e.g. not being able to
             * transition to the requested target level or state.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 4.6.9.2
             */
            valveFault: OptionalEvent(0x1, Priority.Info, TlvValveFaultEvent)
        },

        /**
         * This metadata controls which ValveConfigurationAndControlCluster elements matter.js activates for specific
         * feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { timeSync: true }, component: TimeSyncComponent },
            { flags: { level: true }, component: LevelComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster is used to configure a valve.
     *
     * ValveConfigurationAndControlCluster supports optional features that you can enable with the
     * ValveConfigurationAndControlCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 4.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const TS = { timeSync: true };
    const LVL = { level: true };

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
            autoCloseTime: MutableCluster.AsConditional(
                TimeSyncComponent.attributes.autoCloseTime,
                { mandatoryIf: [TS] }
            ),
            currentLevel: MutableCluster.AsConditional(LevelComponent.attributes.currentLevel, { mandatoryIf: [LVL] }),
            targetLevel: MutableCluster.AsConditional(LevelComponent.attributes.targetLevel, { mandatoryIf: [LVL] }),
            defaultOpenLevel: MutableCluster.AsConditional(
                LevelComponent.attributes.defaultOpenLevel,
                { optionalIf: [LVL] }
            ),
            levelStep: MutableCluster.AsConditional(LevelComponent.attributes.levelStep, { optionalIf: [LVL] })
        },

        commands: Cluster.commands,
        events: Cluster.events
    });

    /**
     * This cluster supports all ValveConfigurationAndControl features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ValveConfigurationAndControlCluster = ValveConfigurationAndControl.Cluster;
export const ValveConfigurationAndControlCluster = ValveConfigurationAndControl.Cluster;
ClusterRegistry.register(ValveConfigurationAndControl.Complete);
