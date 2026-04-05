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
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status } from "../globals/Status.js";

/**
 * Definitions for the ValveConfigurationAndControl cluster.
 *
 * This cluster is used to configure a valve.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 4.6
 */
export declare namespace ValveConfigurationAndControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0081;

    /**
     * Textual cluster identifier.
     */
    export const name: "ValveConfigurationAndControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ValveConfigurationAndControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ValveConfigurationAndControl} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the total duration, in seconds, for which the valve will remain open for this current opening.
         *
         * A value of null shall indicate the duration is not set, meaning that the valve will remain open until closed
         * by the user or some other automation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.1
         */
        openDuration: number | null;

        /**
         * Indicates the default duration, in seconds, for which the valve will remain open, if the OpenDuration field
         * is not present in the Open command.
         *
         * A value of null shall indicate the duration is not set, meaning that the valve will remain open until closed
         * by the user or some other automation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.2
         */
        defaultOpenDuration: number | null;

        /**
         * Indicates the remaining duration, in seconds, until the valve closes.
         *
         * Null:
         *
         *   - When OpenDuration is null, or
         *
         *   - When the valve is closed.
         *
         * The value of this attribute shall only be reported in the following cases:
         *
         *   - When it changes from null to any other value and vice versa, or
         *
         *   - When it changes to 0, or
         *
         *   - When it increases, or
         *
         *   - When the closing time changes.
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
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.4
         */
        remainingDuration: number | null;

        /**
         * Indicates the current state of the valve.
         *
         * A value of null shall indicate that the current state is not known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.5
         */
        currentState: ValveState | null;

        /**
         * Indicates the target state, while changing the state, of the valve.
         *
         * A value of null shall indicate that no target position is set, since the change in state is either done or
         * failed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.6
         */
        targetState: ValveState | null;

        /**
         * Indicates any faults registered by the valve.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.10
         */
        valveFault?: ValveFault;
    }

    /**
     * {@link ValveConfigurationAndControl} supports these elements if it supports feature "TimeSync".
     */
    export interface TimeSyncAttributes {
        /**
         * Indicates the UTC time when the valve will close, depending on value of the OpenDuration attribute.
         *
         * Null:
         *
         *   - When OpenDuration is null, or
         *
         *   - When the valve does not have a synchronized UTCTime in the Time Synchronization cluster, or
         *
         *   - When the valve is closed.
         *
         * When the value of this attribute is earlier or equal to the current UTC time, the valve shall automatically
         * transition to its closed position. The behavior of transitioning to the closed position, shall match the
         * behavior described in the Close command.
         *
         * If this attribute is not null and the Time Synchronization cluster receives a SetUTCTime command, modifying
         * the current UTC time of the device, the value of this attribute shall be adjusted to match the new UTC time
         * plus the value of the RemainingDuration attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.3
         */
        autoCloseTime: number | bigint | null;
    }

    /**
     * {@link ValveConfigurationAndControl} supports these elements if it supports feature "Level".
     */
    export interface LevelAttributes {
        /**
         * Indicates the current level of the valve as a percentage value, between fully closed and fully open. During a
         * transition from one level to another level, the valve SHOULD keep this attribute updated to the best of its
         * ability, in order to represent the actual level of the valve during the movement.
         *
         * A value of 100 percent shall indicate the fully open position.
         *
         * A value of 0 percent shall indicate the fully closed position.
         *
         * A value of null shall indicate that the current state is not known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.7
         */
        currentLevel: number | null;

        /**
         * Indicates the target level of the valve as a percentage value, between fully closed and fully open.
         *
         * The interpretation of the percentage value is the same as for the CurrentLevel attribute.
         *
         * A value of null shall indicate that no target position is set, since the change of level is either done or
         * failed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.8
         */
        targetLevel: number | null;

        /**
         * Indicates the default value used for the TargetLevel attribute, when a valve transitions from the closed to
         * the open state, caused by an Open command, if a TargetLevel field is not present in the Open command.
         *
         * If the LevelStep attribute is present and the value of a write interaction to this attribute field is not
         * 100, the value shall be a supported value as defined by the LevelStep attribute, such that (Value received in
         * the write interaction) % (Value of LevelStep attribute) equals 0. If the resulting value is not 0, the
         * requested DefaultOpenLevel value is considered an unsupported value and a CONSTRAINT_ERROR status shall be
         * returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.9
         */
        defaultOpenLevel?: number;

        /**
         * Indicates the step size the valve can support.
         *
         * The step size defined by this attribute is counted from 0 and the final step towards 100 may be different
         * than what is defined in this attribute. For example, if the value of this attribute is 15, it results in
         * these target values being supported; 0, 15, 30, 45, 60, 75, 90 and 100.
         *
         * The values of 0 and 100 shall always be supported, regardless of the value of this attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.11
         */
        levelStep?: number;
    }

    /**
     * Attributes that may appear in {@link ValveConfigurationAndControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the total duration, in seconds, for which the valve will remain open for this current opening.
         *
         * A value of null shall indicate the duration is not set, meaning that the valve will remain open until closed
         * by the user or some other automation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.1
         */
        openDuration: number | null;

        /**
         * Indicates the default duration, in seconds, for which the valve will remain open, if the OpenDuration field
         * is not present in the Open command.
         *
         * A value of null shall indicate the duration is not set, meaning that the valve will remain open until closed
         * by the user or some other automation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.2
         */
        defaultOpenDuration: number | null;

        /**
         * Indicates the remaining duration, in seconds, until the valve closes.
         *
         * Null:
         *
         *   - When OpenDuration is null, or
         *
         *   - When the valve is closed.
         *
         * The value of this attribute shall only be reported in the following cases:
         *
         *   - When it changes from null to any other value and vice versa, or
         *
         *   - When it changes to 0, or
         *
         *   - When it increases, or
         *
         *   - When the closing time changes.
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
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.4
         */
        remainingDuration: number | null;

        /**
         * Indicates the current state of the valve.
         *
         * A value of null shall indicate that the current state is not known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.5
         */
        currentState: ValveState | null;

        /**
         * Indicates the target state, while changing the state, of the valve.
         *
         * A value of null shall indicate that no target position is set, since the change in state is either done or
         * failed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.6
         */
        targetState: ValveState | null;

        /**
         * Indicates any faults registered by the valve.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.10
         */
        valveFault: ValveFault;

        /**
         * Indicates the UTC time when the valve will close, depending on value of the OpenDuration attribute.
         *
         * Null:
         *
         *   - When OpenDuration is null, or
         *
         *   - When the valve does not have a synchronized UTCTime in the Time Synchronization cluster, or
         *
         *   - When the valve is closed.
         *
         * When the value of this attribute is earlier or equal to the current UTC time, the valve shall automatically
         * transition to its closed position. The behavior of transitioning to the closed position, shall match the
         * behavior described in the Close command.
         *
         * If this attribute is not null and the Time Synchronization cluster receives a SetUTCTime command, modifying
         * the current UTC time of the device, the value of this attribute shall be adjusted to match the new UTC time
         * plus the value of the RemainingDuration attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.3
         */
        autoCloseTime: number | bigint | null;

        /**
         * Indicates the current level of the valve as a percentage value, between fully closed and fully open. During a
         * transition from one level to another level, the valve SHOULD keep this attribute updated to the best of its
         * ability, in order to represent the actual level of the valve during the movement.
         *
         * A value of 100 percent shall indicate the fully open position.
         *
         * A value of 0 percent shall indicate the fully closed position.
         *
         * A value of null shall indicate that the current state is not known.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.7
         */
        currentLevel: number | null;

        /**
         * Indicates the target level of the valve as a percentage value, between fully closed and fully open.
         *
         * The interpretation of the percentage value is the same as for the CurrentLevel attribute.
         *
         * A value of null shall indicate that no target position is set, since the change of level is either done or
         * failed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.8
         */
        targetLevel: number | null;

        /**
         * Indicates the default value used for the TargetLevel attribute, when a valve transitions from the closed to
         * the open state, caused by an Open command, if a TargetLevel field is not present in the Open command.
         *
         * If the LevelStep attribute is present and the value of a write interaction to this attribute field is not
         * 100, the value shall be a supported value as defined by the LevelStep attribute, such that (Value received in
         * the write interaction) % (Value of LevelStep attribute) equals 0. If the resulting value is not 0, the
         * requested DefaultOpenLevel value is considered an unsupported value and a CONSTRAINT_ERROR status shall be
         * returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.9
         */
        defaultOpenLevel: number;

        /**
         * Indicates the step size the valve can support.
         *
         * The step size defined by this attribute is counted from 0 and the final step towards 100 may be different
         * than what is defined in this attribute. For example, if the value of this attribute is 15, it results in
         * these target values being supported; 0, 15, 30, 45, 60, 75, 90 and 100.
         *
         * The values of 0 and 100 shall always be supported, regardless of the value of this attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.7.11
         */
        levelStep: number;
    }

    /**
     * {@link ValveConfigurationAndControl} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to set the valve to its open position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.8.1
         */
        open(request: OpenRequest): MaybePromise;

        /**
         * This command is used to set the valve to its closed position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.8.2
         */
        close(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ValveConfigurationAndControl}.
     */
    export interface Commands extends BaseCommands {}

    /**
     * {@link ValveConfigurationAndControl} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when the valve state changed. For level changes, after the end of movement, for
         * state changes when the new state has been reached.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.1
         */
        valveStateChanged?: ValveStateChangedEvent;

        /**
         * This event shall be generated when the valve registers or clears a fault, e.g. not being able to transition
         * to the requested target level or state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.2
         */
        valveFault?: ValveFaultEvent;
    }

    /**
     * Events that may appear in {@link ValveConfigurationAndControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the valve state changed. For level changes, after the end of movement, for
         * state changes when the new state has been reached.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.1
         */
        valveStateChanged: ValveStateChangedEvent;

        /**
         * This event shall be generated when the valve registers or clears a fault, e.g. not being able to transition
         * to the requested target level or state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.2
         */
        valveFault: ValveFaultEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { timeSync: true }, attributes: TimeSyncAttributes },
        { flags: { level: true }, attributes: LevelAttributes }
    ];
    export type Features = "TimeSync" | "Level";

    /**
     * These are optional features supported by ValveConfigurationAndControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.4
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
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.4.1
         */
        TimeSync = "TimeSync",

        /**
         * Level (LVL)
         *
         * This feature shall indicate that the valve is capable of being adjusted to a specific position, as a
         * percentage, of its full range of motion.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.4.2
         */
        Level = "Level"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.5.2
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
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.5.1
     */
    export declare class ValveFault {
        constructor(values?: Partial<ValveFault> | number);

        /**
         * Unspecified fault detected
         */
        generalFault?: boolean;

        /**
         * Valve is blocked
         */
        blocked?: boolean;

        /**
         * Valve has detected a leak
         */
        leaking?: boolean;

        /**
         * No valve is connected to controller
         */
        notConnected?: boolean;

        /**
         * Short circuit is detected
         */
        shortCircuit?: boolean;

        /**
         * The available current has been exceeded
         */
        currentExceeded?: boolean;
    };

    /**
     * This command is used to set the valve to its open position.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.8.1
     */
    export declare class OpenRequest {
        constructor(values?: Partial<OpenRequest>);

        /**
         * This field shall indicate the duration that the valve will remain open for this specific Open command.
         *
         * A value of null shall indicate the duration is not set, meaning that the valve will remain open until closed
         * by the user or some other automation.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.8.1.1
         */
        openDuration?: number | null;

        /**
         * This field shall indicate the target level used for this specific Open command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.8.1.2
         */
        targetLevel?: number;
    };

    /**
     * This event shall be generated when the valve state changed. For level changes, after the end of movement, for
     * state changes when the new state has been reached.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.1
     */
    export declare class ValveStateChangedEvent {
        constructor(values?: Partial<ValveStateChangedEvent>);

        /**
         * This field shall indicate the new state of the valve.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.1.1
         */
        valveState: ValveState;

        /**
         * This field shall indicate the new level of the valve.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.1.2
         */
        valveLevel?: number;
    };

    /**
     * This event shall be generated when the valve registers or clears a fault, e.g. not being able to transition to
     * the requested target level or state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.2
     */
    export declare class ValveFaultEvent {
        constructor(values?: Partial<ValveFaultEvent>);

        /**
         * This field shall indicate the value of the ValveFault attribute, at the time this event is generated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 4.6.9.2.1
         */
        valveFault: ValveFault;
    };

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.6.1
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
     * @see {@link MatterSpecification.v142.Cluster} § 4.6.6.1
     */
    export class FailureDueToFaultError extends StatusResponseError {
        constructor(message?: string, code?: Status, clusterCode?: number)
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
     * @deprecated Use {@link ValveConfigurationAndControl}.
     */
    export const Cluster: typeof ValveConfigurationAndControl;

    /**
     * @deprecated Use {@link ValveConfigurationAndControl}.
     */
    export const Complete: typeof ValveConfigurationAndControl;

    export const Typing: ValveConfigurationAndControl;
}

/**
 * @deprecated Use {@link ValveConfigurationAndControl}.
 */
export declare const ValveConfigurationAndControlCluster: typeof ValveConfigurationAndControl;

export interface ValveConfigurationAndControl extends ClusterTyping {
    Attributes: ValveConfigurationAndControl.Attributes;
    Commands: ValveConfigurationAndControl.Commands;
    Events: ValveConfigurationAndControl.Events;
    Features: ValveConfigurationAndControl.Features;
    Components: ValveConfigurationAndControl.Components;
}
