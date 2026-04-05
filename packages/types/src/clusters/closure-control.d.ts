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
import type { ThreeLevelAuto } from "../globals/ThreeLevelAuto.js";

/**
 * Definitions for the ClosureControl cluster.
 *
 * This cluster provides an interface for controlling a Closure.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 5.4
 */
export declare namespace ClosureControl {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0104;

    /**
     * Textual cluster identifier.
     */
    export const name: "ClosureControl";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ClosureControl cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ClosureControl} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the current operational state of the closure associated with the server.
         *
         * > [!NOTE]
         *
         * > The MainState diagram is provided exclusively for informational purposes only and is an exemplary design of
         *   the internals of a closure implementation to help illustrate the aspects of function that are considered by
         *   the cluster’s normative text.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.2
         */
        mainState: MainState;

        /**
         * Indicates the currently active errors.
         *
         * An empty list shall indicate that there are no active errors.
         *
         * There shall NOT be duplicate values of ClosureErrorEnum within the CurrentErrorList.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.3
         */
        currentErrorList: ClosureError[];

        /**
         * Indicates the current Position, Latch and/or Speed states, whichever are applicable according to the feature
         * flags set.
         *
         * Null, if the state is unknown. Examples could be, but are not limited to:
         *
         *   - The state of Position/Latch is not known yet because the closure is not calibrated.
         *
         *   - The product has lost its Position/Latch state after manual motion during a shutdown.
         *
         * The values of the different fields within the structure of this attribute depend on:
         *
         *   - The effects of MoveTo commands.
         *
         *   - The effects of SetTarget and Step commands in a Closure Dimension Cluster associated with this cluster,
         *     as described in Section 5.4.4, “Association Between Closure Control and Closure Dimension Clusters”.
         *
         *   - The Stop command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.4
         */
        overallCurrentState: OverallCurrentState | null;

        /**
         * Indicates the TargetPosition, TargetLatch and/or TargetSpeed values, whichever are applicable according to
         * the feature flags set.
         *
         * Null, if the state is unknown. For example after a reboot.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.5
         */
        overallTargetState: OverallTargetState | null;
    }

    /**
     * {@link ClosureControl} supports these elements if it supports feature "PositioningNotInstantaneous".
     */
    export interface PositioningNotInstantaneousAttributes {
        /**
         * Indicates the estimated time left before the operation is completed, in seconds.
         *
         * A value of 0 (zero) means that the operation has completed.
         *
         * A value of null indicates that there is no time currently defined until operation completion. This may happen
         * because the completion time is unknown.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - If the tracked operation has changed due to a change in the MainState attribute, or
         *
         *   - When it changes from 0 to any other value and vice versa, or
         *
         *   - When it changes from null to any other value and vice versa, or
         *
         *   - When it increases, or
         *
         *   - When there is any increase or decrease in the estimated time remaining that was due to progressing
         *     insight of the server’s control logic.
         *
         * Changes to this attribute merely due to the normal passage of time with no other dynamic change of closure
         * state shall NOT be reported.
         *
         * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the reporting
         * of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.1
         */
        countdownTime?: number | null;
    }

    /**
     * {@link ClosureControl} supports these elements if it supports feature "MotionLatching".
     */
    export interface MotionLatchingAttributes {
        /**
         * This attribute shall specify whether the latch mechanism can be latched or unlatched remotely.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.6
         */
        latchControlModes: LatchControlModes;
    }

    /**
     * Attributes that may appear in {@link ClosureControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current operational state of the closure associated with the server.
         *
         * > [!NOTE]
         *
         * > The MainState diagram is provided exclusively for informational purposes only and is an exemplary design of
         *   the internals of a closure implementation to help illustrate the aspects of function that are considered by
         *   the cluster’s normative text.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.2
         */
        mainState: MainState;

        /**
         * Indicates the currently active errors.
         *
         * An empty list shall indicate that there are no active errors.
         *
         * There shall NOT be duplicate values of ClosureErrorEnum within the CurrentErrorList.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.3
         */
        currentErrorList: ClosureError[];

        /**
         * Indicates the current Position, Latch and/or Speed states, whichever are applicable according to the feature
         * flags set.
         *
         * Null, if the state is unknown. Examples could be, but are not limited to:
         *
         *   - The state of Position/Latch is not known yet because the closure is not calibrated.
         *
         *   - The product has lost its Position/Latch state after manual motion during a shutdown.
         *
         * The values of the different fields within the structure of this attribute depend on:
         *
         *   - The effects of MoveTo commands.
         *
         *   - The effects of SetTarget and Step commands in a Closure Dimension Cluster associated with this cluster,
         *     as described in Section 5.4.4, “Association Between Closure Control and Closure Dimension Clusters”.
         *
         *   - The Stop command.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.4
         */
        overallCurrentState: OverallCurrentState | null;

        /**
         * Indicates the TargetPosition, TargetLatch and/or TargetSpeed values, whichever are applicable according to
         * the feature flags set.
         *
         * Null, if the state is unknown. For example after a reboot.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.5
         */
        overallTargetState: OverallTargetState | null;

        /**
         * Indicates the estimated time left before the operation is completed, in seconds.
         *
         * A value of 0 (zero) means that the operation has completed.
         *
         * A value of null indicates that there is no time currently defined until operation completion. This may happen
         * because the completion time is unknown.
         *
         * Changes to this attribute shall only be marked as reportable in the following cases:
         *
         *   - If the tracked operation has changed due to a change in the MainState attribute, or
         *
         *   - When it changes from 0 to any other value and vice versa, or
         *
         *   - When it changes from null to any other value and vice versa, or
         *
         *   - When it increases, or
         *
         *   - When there is any increase or decrease in the estimated time remaining that was due to progressing
         *     insight of the server’s control logic.
         *
         * Changes to this attribute merely due to the normal passage of time with no other dynamic change of closure
         * state shall NOT be reported.
         *
         * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the reporting
         * of this attribute in order to keep track of the remaining duration.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.1
         */
        countdownTime: number | null;

        /**
         * This attribute shall specify whether the latch mechanism can be latched or unlatched remotely.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.7.6
         */
        latchControlModes: LatchControlModes;
    }

    /**
     * {@link ClosureControl} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * On receipt of this command, the closure shall operate to update its position, latch state and/or motion
         * speed.
         *
         * The rationale behind defining the conformance as being purely optional in the table above is to ensure that
         * commands containing one or more fields related to unsupported features are still accepted, rather than being
         * rejected outright. For example, if a simple client, which is not able to determine the capabilities of the
         * server, invokes a command that includes both position and speed, a server that does not support the speed
         * feature would simply ignore the speed field while still adjusting its position as requested.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.2
         */
        moveTo(request: MoveToRequest): MaybePromise;
    }

    /**
     * {@link ClosureControl} supports these elements if it supports feature "NotInstantaneous".
     */
    export interface NotInstantaneousCommands {
        /**
         * On receipt of this command, the closure shall stop its movement as fast as the closure is able too.
         *
         * If the server’s MainState attribute has one of the following values:
         *
         *   - Moving
         *
         *   - WaitingForMotion
         *
         *   - Calibrating
         *
         * then any motions shall be stopped and the MainState attribute shall be set to Stopped.
         *
         * A status code of SUCCESS shall always be returned, regardless of the value of the MainState attribute when
         * this command is received.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.1
         */
        stop(): MaybePromise;
    }

    /**
     * {@link ClosureControl} supports these elements if it supports feature "Calibration".
     */
    export interface CalibrationCommands {
        /**
         * This command is used to trigger a calibration of the closure.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.3
         */
        calibrate(): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ClosureControl}.
     */
    export interface Commands extends
        BaseCommands,
        NotInstantaneousCommands,
        CalibrationCommands
    {}

    /**
     * {@link ClosureControl} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when a reportable error condition is detected. A closure that generates this
         * event shall also set the MainState attribute to Error, indicating an error condition.
         *
         * This event shall contain the following fields:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.1
         */
        operationalError: OperationalErrorEvent;

        /**
         * This event, if supported, shall be generated when the SecureState field in the OverallCurrentState attribute
         * changes. It is used to indicate whether a closure is securing a space against possible unauthorized entry.
         *
         * This event shall contain the following fields:
         *
         *   - True, when the closure is in a secure state, e.g. unauthorized/undetectable access is not possible.
         *
         *   - False, when the closure is in an insecure state, e.g. unauthorized/undetectable access is possible.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.4
         */
        secureStateChanged: SecureStateChangedEvent;
    }

    /**
     * {@link ClosureControl} supports these elements if it supports feature "NotInstantaneous".
     */
    export interface NotInstantaneousEvents {
        /**
         * This event, if supported, shall be generated when the overall operation ends, either successfully or
         * otherwise. For example, the event is sent upon the completion of a movement operation in a blind.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.2
         */
        movementCompleted: void;
    }

    /**
     * {@link ClosureControl} supports these elements if it supports feature "ManuallyOperable".
     */
    export interface ManuallyOperableEvents {
        /**
         * This event, if supported, shall be generated when the MainStateEnum attribute changes state to and from
         * disengaged, indicating if the actuator is Engaged or Disengaged.
         *
         * This event shall contain the following fields:
         *
         *   - True, when the actuator is in a Engaged state, actuator movements possible.
         *
         *   - False, when the actuator is in a Disengaged state, preventing any actuator movements.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.3
         */
        engageStateChanged: EngageStateChangedEvent;
    }

    /**
     * Events that may appear in {@link ClosureControl}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when a reportable error condition is detected. A closure that generates this
         * event shall also set the MainState attribute to Error, indicating an error condition.
         *
         * This event shall contain the following fields:
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.1
         */
        operationalError: OperationalErrorEvent;

        /**
         * This event, if supported, shall be generated when the SecureState field in the OverallCurrentState attribute
         * changes. It is used to indicate whether a closure is securing a space against possible unauthorized entry.
         *
         * This event shall contain the following fields:
         *
         *   - True, when the closure is in a secure state, e.g. unauthorized/undetectable access is not possible.
         *
         *   - False, when the closure is in an insecure state, e.g. unauthorized/undetectable access is possible.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.4
         */
        secureStateChanged: SecureStateChangedEvent;

        /**
         * This event, if supported, shall be generated when the overall operation ends, either successfully or
         * otherwise. For example, the event is sent upon the completion of a movement operation in a blind.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.2
         */
        movementCompleted: void;

        /**
         * This event, if supported, shall be generated when the MainStateEnum attribute changes state to and from
         * disengaged, indicating if the actuator is Engaged or Disengaged.
         *
         * This event shall contain the following fields:
         *
         *   - True, when the actuator is in a Engaged state, actuator movements possible.
         *
         *   - False, when the actuator is in a Disengaged state, preventing any actuator movements.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.3
         */
        engageStateChanged: EngageStateChangedEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { positioning: true, instantaneous: false }, attributes: PositioningNotInstantaneousAttributes },
        { flags: { motionLatching: true }, attributes: MotionLatchingAttributes },
        { flags: { instantaneous: false }, commands: NotInstantaneousCommands, events: NotInstantaneousEvents },
        { flags: { manuallyOperable: true }, events: ManuallyOperableEvents },
        { flags: { calibration: true }, commands: CalibrationCommands }
    ];

    export type Features = "Positioning" | "MotionLatching" | "Instantaneous" | "Speed" | "Ventilation" | "Pedestrian" | "Calibration" | "Protection" | "ManuallyOperable";

    /**
     * These are optional features supported by ClosureControlCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.5
     */
    export enum Feature {
        /**
         * Positioning (PS)
         *
         * This feature shall indicate that the closure can be set to discrete positions, including at minimum the
         * FullyOpen and FullyClosed positions.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.1
         */
        Positioning = "Positioning",

        /**
         * MotionLatching (LT)
         *
         * This feature shall indicate that the closure can be latched and unlatched. When latched, the feature secures
         * an axis, preventing associated actuators from moving components along that axis.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.2
         */
        MotionLatching = "MotionLatching",

        /**
         * Instantaneous (IS)
         *
         * This feature shall indicate that the closure is capable of changing its position or state instantaneously. As
         * a result, the Speed feature is not applicable, and the Stop command is not usable. In such closures, the
         * OverallCurrentState attribute shall immediately follow the OverallTargetState attribute. The state transition
         * diagram remains applicable, however, transitions involving the Stop state shall be omitted.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.3
         */
        Instantaneous = "Instantaneous",

        /**
         * Speed (SP)
         *
         * This feature shall indicate that the closure supports configurable speed during motion toward a target
         * position. The feature uses the values in ThreeLevelAutoEnum to set the supported speed levels.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.4
         */
        Speed = "Speed",

        /**
         * Ventilation (VT)
         *
         * This feature shall indicate that the closure can be set to a designated Ventilation position (e.g., partially
         * open).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.5
         */
        Ventilation = "Ventilation",

        /**
         * Pedestrian (PD)
         *
         * This feature shall indicate that the closure can be set to a dedicated Pedestrian position. The Pedestrian
         * position provides a clear walkway through the closure.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.6
         */
        Pedestrian = "Pedestrian",

        /**
         * Calibration (CL)
         *
         * This feature shall indicate the capability to trigger a calibration procedure. The calibration can either be
         * fully automated, or require manual steps not described in this specification.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.7
         */
        Calibration = "Calibration",

        /**
         * Protection (PT)
         *
         * This feature shall indicate that the closure is capable of activating a form of protection, such as
         * protection against wind. A protection is manufacturer-specific, and it could be a simple software limitation,
         * or a mechanical system deployed by the closure.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.8
         */
        Protection = "Protection",

        /**
         * ManuallyOperable (MO)
         *
         * This feature shall indicate that the closure can be operated manually by a user, such as to open a window.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.5.9
         */
        ManuallyOperable = "ManuallyOperable"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.3
     */
    export enum MainState {
        /**
         * Closure is stopped
         */
        Stopped = 0,

        /**
         * Closure is actively moving
         */
        Moving = 1,

        /**
         * Closure is waiting before a motion (e.g. pre-heat, pre-check)
         */
        WaitingForMotion = 2,

        /**
         * Closure is in an error state
         */
        Error = 3,

        /**
         * Closure is currently calibrating its Opened and Closed limits to determine effective physical range
         */
        Calibrating = 4,

        /**
         * Some protective measures are activated to prevent damage to the closure. Commands MAY be rejected.
         */
        Protected = 5,

        /**
         * Closure has a disengaged element preventing any actuator movements
         */
        Disengaged = 6,

        /**
         * Movement commands are ignored since the closure is not operational and requires further setup and/or
         * calibration
         */
        SetupRequired = 7
    }

    /**
     * The following ranges are reserved for general and manufacturer specified closure errors.
     *
     * The manufacturer-specific error definitions shall NOT duplicate the general error definitions. Such
     * manufacturer-specific error definitions shall be scoped in the context of the Vendor ID present in the Basic
     * Information cluster.
     *
     * The general closure error values are defined in the table below.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.4
     */
    export enum ClosureError {
        /**
         * An obstacle is blocking the closure movement
         */
        PhysicallyBlocked = 0,

        /**
         * The closure is unsafe to move, as determined by a sensor (e.g. photoelectric sensor) before attempting
         * movement
         */
        BlockedBySensor = 1,

        /**
         * A warning raised by the closure that indicates an over-temperature, e.g. due to excessive drive or stall
         * current
         */
        TemperatureLimited = 2,

        /**
         * Some malfunctions that are not easily recoverable are detected, or urgent servicing is needed
         */
        MaintenanceRequired = 3,

        /**
         * An internal element is prohibiting motion, e.g. an integrated door within a bigger garage door is open and
         * prevents motion
         */
        InternalInterference = 4
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.5
     */
    export declare class OverallCurrentState {
        constructor(values?: Partial<OverallCurrentState>);

        /**
         * This field shall indicate the current Position state of the closure, as defined in the CurrentPositionEnum.
         *
         * When the Positioning (PS) feature flag is set, the rules for setting the value of the Position field are:
         *
         *   - If the closure doesn’t know accurately its current state the value null shall be used.
         *
         *   - Otherwise, the most appropriate supported value shall be used.
         *
         * Clients which only consider the binary opened/closed states of a closure SHOULD consider the closure to be
         * closed if the value of this field is FullyClosed. Otherwise those clients SHOULD consider the closure opened
         * (non-closed).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.5.1
         */
        position?: CurrentPosition | null;

        /**
         * This field shall indicate the current latching state of the closure.
         *
         * When the MotionLatching (LT) feature flag is set, the rules for setting the value of the Latch field are:
         *
         *   - If the closure doesn’t know its current state, the value shall be null.
         *
         *   - Else, if the closure is partially latched or not latched, the value shall be false.
         *
         *   - Otherwise, if the closure is fully latched, the value shall be true.
         *
         *     > [!NOTE]
         *
         *     > Some products exposing the MotionLatching (LT) feature might not be able to drive an actuator to
         *       achieve a latched state. Such products are built with springs or similar mechanisms to unlatch but
         *       require the user to latch manually.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.5.2
         */
        latch?: boolean | null;

        /**
         * This field shall indicate the current speed of the closure, as defined in the ThreeLevelAutoEnum.
         *
         * When the Speed (SP) feature flag is set, the rules for setting the value of the Speed field are:
         *
         * If the closure’s MainState attribute is currently either in WaitingForMotion or Moving state, the closure’s
         * most accurate current overall speed shall be used. Otherwise, the value used shall be the most appropriate
         * default supported speed value.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.5.3
         */
        speed?: ThreeLevelAuto;

        /**
         * This field shall indicate the current secure state of the closure.
         *
         * A secure state requires the closure to meet all of the following conditions defined by the
         * OverallCurrentState Struct based on feature support:
         *
         *   - If the Positioning feature is supported, then the Position field of OverallCurrentState is FullyClosed.
         *
         *   - If the MotionLatching feature is supported, then the Latch field of OverallCurrentState is True.
         *
         * The rules for setting the value of the SecureState field shall be:
         *
         *   - True if the closure meets the required conditions for a secure state, preventing unauthorized or
         *     undetectable access.
         *
         *   - False if the closure does not meet these conditions and unauthorized or undetectable access is possible.
         *
         *   - null if the closure’s current secure state is unknown.
         *
         * This field provides no additional details regarding mechanical properties of the closure mechanism. It is
         * intended only as supplementary information and not as a replacement for a comprehensive security system. It
         * is primarily useful for closures on the outer shell of objects, such as garage doors, windows, or doors.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.5.4
         */
        secureState: boolean | null;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.6
     */
    export declare class OverallTargetState {
        constructor(values?: Partial<OverallTargetState>);

        /**
         * This field shall indicate the target position that the closure is moving to. It shall be null if there is no
         * target position.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.6.1
         */
        position?: TargetPosition | null;

        /**
         * This field shall indicate the desired latching state of the closure. It shall be null if there is no desired
         * latching state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.6.2
         */
        latch?: boolean | null;

        /**
         * This field shall indicate the desired speed at which the closure should perform the movement toward the
         * target position. If no speed value has yet been set, the server shall select and set one of the speed values
         * defined in the ThreeLevelAutoEnum.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.6.3
         */
        speed?: ThreeLevelAuto;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.7
     */
    export declare class LatchControlModes {
        constructor(values?: Partial<LatchControlModes> | number);

        /**
         * Remote latching capability
         *
         * This bit shall indicate whether the latch supports remote latching or not:
         *
         *   - 0 = the latch can only be latched through manual, physical operation.
         *
         *   - 1 = the latch can be latched via remote control (e.g., electronic or remote actuation).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.7.1
         */
        remoteLatching?: boolean;

        /**
         * Remote unlatching capability
         *
         * This bit shall indicate whether the latch supports remote unlatching or not:
         *
         *   - 0 = the latch can only be unlatched through manual, physical operation.
         *
         *   - 1 = the latch can be unlatched via remote control (e.g., electronic or remote actuation).
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.7.2
         */
        remoteUnlatching?: boolean;
    };

    /**
     * On receipt of this command, the closure shall operate to update its position, latch state and/or motion speed.
     *
     * The rationale behind defining the conformance as being purely optional in the table above is to ensure that
     * commands containing one or more fields related to unsupported features are still accepted, rather than being
     * rejected outright. For example, if a simple client, which is not able to determine the capabilities of the
     * server, invokes a command that includes both position and speed, a server that does not support the speed feature
     * would simply ignore the speed field while still adjusting its position as requested.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.2
     */
    export declare class MoveToRequest {
        constructor(values?: Partial<MoveToRequest>);

        /**
         * This field shall indicate the position where the closure is moving to, as defined in the TargetPositionEnum.
         *
         * If the field is present but its value is not within constraints, then:
         *
         *   - If the Positioning (PS) feature is not supported, the value of this field shall be ignored.
         *
         *   - If the Positioning (PS) feature is supported, a status code of CONSTRAINT_ERROR shall be returned.
         *
         * If the Positioning (PS) feature is supported and the Position field is not present, the closure shall use the
         * value of the Position field in the OverallTargetState attribute as the fallback. If the Position field in the
         * OverallTargetState attribute is NULL, the position is unknown and the fallback is not applicable; in this
         * case the field shall be ignored and the closure shall NOT change its position.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.2.1
         */
        position?: TargetPosition;

        /**
         * This field shall indicate the desired latching state of the closure, as defined in the
         * OverallCurrentStateStruct Latch Field.
         *
         * If the field is present but its value is not within constraints, then:
         *
         *   - If the MotionLatching (LT) feature is not supported, the value of this field shall be ignored.
         *
         *   - If the MotionLatching (LT) feature is supported, a status code of CONSTRAINT_ERROR shall be returned.
         *
         * If the MotionLatching (LT) feature is supported and the Latch field is not present, the closure shall use the
         * value of the Latch field in the OverallTargetState attribute as the fallback. If the Latch field in the
         * OverallTargetState attribute is NULL, the latch state is unknown and the fallback is not applicable, in this
         * case, the field shall be ignored and the closure shall NOT change its latch state.
         *
         * If the closure supports the MotionLatching (LT) feature, it shall either fulfill the latch request and update
         * OverallTargetState.Latch or, if the "LatchControlModes" attribute specifies that manual intervention is
         * required to latch - respond with INVALID_IN_STATE and remain in its current state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.2.2
         */
        latch?: boolean;

        /**
         * This field shall indicate a desired overall speed of motion, as defined in the ThreeLevelAutoEnum.
         *
         * If the field is present but its value is not within constraints, then:
         *
         *   - If the Speed(SP) feature is not supported, the value of this field shall be ignored.
         *
         *   - If the Speed(SP) feature is supported, a status code of CONSTRAINT_ERROR shall be returned.
         *
         * If the closure supports the Speed(SP) feature, it shall set the Speed field of the OverallCurrentState
         * attribute to the new speed.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.8.2.3
         */
        speed?: ThreeLevelAuto;
    };

    /**
     * This event shall be generated when a reportable error condition is detected. A closure that generates this event
     * shall also set the MainState attribute to Error, indicating an error condition.
     *
     * This event shall contain the following fields:
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.1
     */
    export declare class OperationalErrorEvent {
        constructor(values?: Partial<OperationalErrorEvent>);
        errorState: ClosureError[];
    };

    /**
     * This event, if supported, shall be generated when the SecureState field in the OverallCurrentState attribute
     * changes. It is used to indicate whether a closure is securing a space against possible unauthorized entry.
     *
     * This event shall contain the following fields:
     *
     *   - True, when the closure is in a secure state, e.g. unauthorized/undetectable access is not possible.
     *
     *   - False, when the closure is in an insecure state, e.g. unauthorized/undetectable access is possible.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.4
     */
    export declare class SecureStateChangedEvent {
        constructor(values?: Partial<SecureStateChangedEvent>);
        secureValue: boolean;
    };

    /**
     * This event, if supported, shall be generated when the MainStateEnum attribute changes state to and from
     * disengaged, indicating if the actuator is Engaged or Disengaged.
     *
     * This event shall contain the following fields:
     *
     *   - True, when the actuator is in a Engaged state, actuator movements possible.
     *
     *   - False, when the actuator is in a Disengaged state, preventing any actuator movements.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.9.3
     */
    export declare class EngageStateChangedEvent {
        constructor(values?: Partial<EngageStateChangedEvent>);
        engageValue: boolean;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.1
     */
    export enum CurrentPosition {
        /**
         * Fully closed state
         */
        FullyClosed = 0,

        /**
         * Fully opened state
         */
        FullyOpened = 1,

        /**
         * Partially opened state (closure is not fully opened or fully closed)
         */
        PartiallyOpened = 2,

        /**
         * Closure is in the Pedestrian position
         */
        OpenedForPedestrian = 3,

        /**
         * Closure is in the Ventilation position
         */
        OpenedForVentilation = 4,

        /**
         * Closure is in its "Signature position"
         *
         * The Signature allows a pre-recorded manufacturer- or installer-defined position to be reached.
         *
         * This Signature position depends on the closure type. Some examples include:
         *
         *   - Gate, Garage Door → Pedestrian and pets, or one leaf only.
         *
         *   - Venetian Blind → Lowered down with flat slats.
         *
         *   - Door → Position to open for a person or someone in a wheelchair.
         *
         *   - Window → Position to 10% for tilt position.
         *
         *   - Roller Shutter → Closed with maximum gap between the slats.
         *
         *   - By default the Signature position may apply the same outcome as PartiallyOpened.
         *
         * If no such separately defined position exists on the closure, the Signature value shall have the same
         * position meaning as FullyOpened.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.1.1
         */
        OpenedAtSignature = 5
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 5.4.6.2
     */
    export enum TargetPosition {
        /**
         * Move to a fully closed state
         */
        MoveToFullyClosed = 0,

        /**
         * Move to a fully open state
         */
        MoveToFullyOpen = 1,

        /**
         * Move to the Pedestrian position
         */
        MoveToPedestrianPosition = 2,

        /**
         * Move to the Ventilation position
         */
        MoveToVentilationPosition = 3,

        /**
         * Move to the Signature position
         */
        MoveToSignaturePosition = 4
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
     * @deprecated Use {@link ClosureControl}.
     */
    export const Cluster: typeof ClosureControl;

    /**
     * @deprecated Use {@link ClosureControl}.
     */
    export const Complete: typeof ClosureControl;

    export const Typing: ClosureControl;
}

/**
 * @deprecated Use {@link ClosureControl}.
 */
export declare const ClosureControlCluster: typeof ClosureControl;

export interface ClosureControl extends ClusterTyping {
    Attributes: ClosureControl.Attributes;
    Commands: ClosureControl.Commands;
    Events: ClosureControl.Events;
    Features: ClosureControl.Features;
    Components: ClosureControl.Components;
}
