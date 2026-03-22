/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { OptionalAttribute, FixedAttribute, Command, TlvNoResponse, Event, Attribute } from "../cluster/Cluster.js";
import { TlvUInt32, TlvUInt8, TlvBitmap, TlvEnum } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Priority } from "../globals/Priority.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "@matter/model";
import { TlvArray } from "../tlv/TlvArray.js";
import { ThreeLevelAuto } from "../globals/ThreeLevelAuto.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ClosureControl {
    /**
     * These are optional features supported by ClosureControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.5
     */
    export enum Feature {
        /**
         * Positioning (PS)
         *
         * This feature shall indicate that the closure can be set to discrete positions, including at minimum the
         * FullyOpen and FullyClosed positions.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.1
         */
        Positioning = "Positioning",

        /**
         * MotionLatching (LT)
         *
         * This feature shall indicate that the closure can be latched and unlatched. When latched, the feature secures
         * an axis, preventing associated actuators from moving components along that axis.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.2
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.3
         */
        Instantaneous = "Instantaneous",

        /**
         * Speed (SP)
         *
         * This feature shall indicate that the closure supports configurable speed during motion toward a target
         * position. The feature uses the values in ThreeLevelAutoEnum to set the supported speed levels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.4
         */
        Speed = "Speed",

        /**
         * Ventilation (VT)
         *
         * This feature shall indicate that the closure can be set to a designated Ventilation position (e.g., partially
         * open).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.5
         */
        Ventilation = "Ventilation",

        /**
         * Pedestrian (PD)
         *
         * This feature shall indicate that the closure can be set to a dedicated Pedestrian position. The Pedestrian
         * position provides a clear walkway through the closure.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.6
         */
        Pedestrian = "Pedestrian",

        /**
         * Calibration (CL)
         *
         * This feature shall indicate the capability to trigger a calibration procedure. The calibration can either be
         * fully automated, or require manual steps not described in this specification.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.7
         */
        Calibration = "Calibration",

        /**
         * Protection (PT)
         *
         * This feature shall indicate that the closure is capable of activating a form of protection, such as
         * protection against wind. A protection is manufacturer-specific, and it could be a simple software limitation,
         * or a mechanical system deployed by the closure.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.8
         */
        Protection = "Protection",

        /**
         * ManuallyOperable (MO)
         *
         * This feature shall indicate that the closure can be operated manually by a user, such as to open a window.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.9
         */
        ManuallyOperable = "ManuallyOperable"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.7
     */
    export const LatchControlModes = {
        /**
         * Remote latching capability
         *
         * This bit shall indicate whether the latch supports remote latching or not:
         *
         *   - 0 = the latch can only be latched through manual, physical operation.
         *
         *   - 1 = the latch can be latched via remote control (e.g., electronic or remote actuation).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.7.1
         */
        remoteLatching: BitFlag(0),

        /**
         * Remote unlatching capability
         *
         * This bit shall indicate whether the latch supports remote unlatching or not:
         *
         *   - 0 = the latch can only be unlatched through manual, physical operation.
         *
         *   - 1 = the latch can be unlatched via remote control (e.g., electronic or remote actuation).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.7.2
         */
        remoteUnlatching: BitFlag(1)
    };

    /**
     * Body of the ClosureControl engageStateChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.3
     */
    export const TlvEngageStateChangedEvent = TlvObject({ engageValue: TlvField(0, TlvBoolean) });

    /**
     * Body of the ClosureControl engageStateChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.3
     */
    export interface EngageStateChangedEvent extends TypeFromSchema<typeof TlvEngageStateChangedEvent> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.3
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.4
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.1
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.1.1
         */
        OpenedAtSignature = 5
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.5
     */
    export const TlvOverallCurrentState = TlvObject({
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.5.1
         */
        position: TlvOptionalField(0, TlvNullable(TlvEnum<CurrentPosition>())),

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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.5.2
         */
        latch: TlvOptionalField(1, TlvNullable(TlvBoolean)),

        /**
         * This field shall indicate the current speed of the closure, as defined in the ThreeLevelAutoEnum.
         *
         * When the Speed (SP) feature flag is set, the rules for setting the value of the Speed field are:
         *
         * If the closure’s MainState attribute is currently either in WaitingForMotion or Moving state, the closure’s
         * most accurate current overall speed shall be used. Otherwise, the value used shall be the most appropriate
         * default supported speed value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.5.3
         */
        speed: TlvOptionalField(2, TlvEnum<ThreeLevelAuto>()),

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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.5.4
         */
        secureState: TlvField(3, TlvNullable(TlvBoolean))
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.5
     */
    export interface OverallCurrentState extends TypeFromSchema<typeof TlvOverallCurrentState> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.2
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.6
     */
    export const TlvOverallTargetState = TlvObject({
        /**
         * This field shall indicate the target position that the closure is moving to. It shall be null if there is no
         * target position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.6.1
         */
        position: TlvOptionalField(0, TlvNullable(TlvEnum<TargetPosition>())),

        /**
         * This field shall indicate the desired latching state of the closure. It shall be null if there is no desired
         * latching state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.6.2
         */
        latch: TlvOptionalField(1, TlvNullable(TlvBoolean)),

        /**
         * This field shall indicate the desired speed at which the closure should perform the movement toward the
         * target position. If no speed value has yet been set, the server shall select and set one of the speed values
         * defined in the ThreeLevelAutoEnum.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.6.3
         */
        speed: TlvOptionalField(2, TlvEnum<ThreeLevelAuto>())
    });

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.6.6
     */
    export interface OverallTargetState extends TypeFromSchema<typeof TlvOverallTargetState> {}

    /**
     * Input to the ClosureControl moveTo command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2
     */
    export const TlvMoveToRequest = TlvObject({
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2.1
         */
        position: TlvOptionalField(0, TlvEnum<TargetPosition>()),

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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2.2
         */
        latch: TlvOptionalField(1, TlvBoolean),

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
         * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2.3
         */
        speed: TlvOptionalField(2, TlvEnum<ThreeLevelAuto>())
    });

    /**
     * Input to the ClosureControl moveTo command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2
     */
    export interface MoveToRequest extends TypeFromSchema<typeof TlvMoveToRequest> {}

    /**
     * Body of the ClosureControl operationalError event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.1
     */
    export const TlvOperationalErrorEvent = TlvObject({
        errorState: TlvField(0, TlvArray(TlvEnum<ClosureError>(), { minLength: 1, maxLength: 10 }))
    });

    /**
     * Body of the ClosureControl operationalError event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.1
     */
    export interface OperationalErrorEvent extends TypeFromSchema<typeof TlvOperationalErrorEvent> {}

    /**
     * Body of the ClosureControl secureStateChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.4
     */
    export const TlvSecureStateChangedEvent = TlvObject({ secureValue: TlvField(0, TlvBoolean) });

    /**
     * Body of the ClosureControl secureStateChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.4
     */
    export interface SecureStateChangedEvent extends TypeFromSchema<typeof TlvSecureStateChangedEvent> {}

    /**
     * A ClosureControlCluster supports these elements if it supports feature Positioning and it doesn't support feature
     * IS.
     */
    export const PositioningNotInstantaneousComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the estimated time left before the operation is completed, in seconds.
             *
             * A value of 0 (zero) means that the operation has completed.
             *
             * A value of null indicates that there is no time currently defined until operation completion. This may
             * happen because the completion time is unknown.
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
             * Changes to this attribute merely due to the normal passage of time with no other dynamic change of
             * closure state shall NOT be reported.
             *
             * As this attribute is not being reported during a regular countdown, clients SHOULD NOT rely on the
             * reporting of this attribute in order to keep track of the remaining duration.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.7.1
             */
            countdownTime: OptionalAttribute(0x0, TlvNullable(TlvUInt32.bound({ max: 259200 })), { default: null })
        }
    });

    /**
     * A ClosureControlCluster supports these elements if it supports feature MotionLatching.
     */
    export const MotionLatchingComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify whether the latch mechanism can be latched or unlatched remotely.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.7.6
             */
            latchControlModes: FixedAttribute(0x5, TlvBitmap(TlvUInt8, LatchControlModes))
        }
    });

    /**
     * A ClosureControlCluster supports these elements if doesn't support feature IS.
     */
    export const NotInstantaneousComponent = MutableCluster.Component({
        commands: {
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
             * A status code of SUCCESS shall always be returned, regardless of the value of the MainState attribute
             * when this command is received.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.1
             */
            stop: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse)
        },

        events: {
            /**
             * This event, if supported, shall be generated when the overall operation ends, either successfully or
             * otherwise. For example, the event is sent upon the completion of a movement operation in a blind.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.2
             */
            movementCompleted: Event(0x1, Priority.Info, TlvNoArguments)
        }
    });

    /**
     * A ClosureControlCluster supports these elements if it supports feature ManuallyOperable.
     */
    export const ManuallyOperableComponent = MutableCluster.Component({
        events: {
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
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.3
             */
            engageStateChanged: Event(0x2, Priority.Info, TlvEngageStateChangedEvent)
        }
    });

    /**
     * A ClosureControlCluster supports these elements if it supports feature Calibration.
     */
    export const CalibrationComponent = MutableCluster.Component({
        commands: {
            /**
             * This command is used to trigger a calibration of the closure.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.3
             */
            calibrate: Command(0x2, TlvNoArguments, 0x2, TlvNoResponse, { invokeAcl: AccessLevel.Manage, timed: true })
        }
    });

    /**
     * These elements and properties are present in all ClosureControl clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x104,
        name: "ClosureControl",
        revision: 1,

        features: {
            /**
             * This feature shall indicate that the closure can be set to discrete positions, including at minimum the
             * FullyOpen and FullyClosed positions.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.1
             */
            positioning: BitFlag(0),

            /**
             * This feature shall indicate that the closure can be latched and unlatched. When latched, the feature
             * secures an axis, preventing associated actuators from moving components along that axis.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.2
             */
            motionLatching: BitFlag(1),

            /**
             * This feature shall indicate that the closure is capable of changing its position or state
             * instantaneously. As a result, the Speed feature is not applicable, and the Stop command is not usable. In
             * such closures, the OverallCurrentState attribute shall immediately follow the OverallTargetState
             * attribute. The state transition diagram remains applicable, however, transitions involving the Stop state
             * shall be omitted.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.3
             */
            instantaneous: BitFlag(2),

            /**
             * This feature shall indicate that the closure supports configurable speed during motion toward a target
             * position. The feature uses the values in ThreeLevelAutoEnum to set the supported speed levels.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.4
             */
            speed: BitFlag(3),

            /**
             * This feature shall indicate that the closure can be set to a designated Ventilation position (e.g.,
             * partially open).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.5
             */
            ventilation: BitFlag(4),

            /**
             * This feature shall indicate that the closure can be set to a dedicated Pedestrian position. The
             * Pedestrian position provides a clear walkway through the closure.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.6
             */
            pedestrian: BitFlag(5),

            /**
             * This feature shall indicate the capability to trigger a calibration procedure. The calibration can either
             * be fully automated, or require manual steps not described in this specification.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.7
             */
            calibration: BitFlag(6),

            /**
             * This feature shall indicate that the closure is capable of activating a form of protection, such as
             * protection against wind. A protection is manufacturer-specific, and it could be a simple software
             * limitation, or a mechanical system deployed by the closure.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.8
             */
            protection: BitFlag(7),

            /**
             * This feature shall indicate that the closure can be operated manually by a user, such as to open a
             * window.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.5.9
             */
            manuallyOperable: BitFlag(8)
        },

        attributes: {
            /**
             * Indicates the current operational state of the closure associated with the server.
             *
             * > [!NOTE]
             *
             * > The MainState diagram is provided exclusively for informational purposes only and is an exemplary
             *   design of the internals of a closure implementation to help illustrate the aspects of function that are
             *   considered by the cluster’s normative text.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.7.2
             */
            mainState: Attribute(0x1, TlvEnum<MainState>()),

            /**
             * Indicates the currently active errors.
             *
             * An empty list shall indicate that there are no active errors.
             *
             * There shall NOT be duplicate values of ClosureErrorEnum within the CurrentErrorList.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.7.3
             */
            currentErrorList: Attribute(0x2, TlvArray(TlvEnum<ClosureError>(), { maxLength: 10 }), { default: [] }),

            /**
             * Indicates the current Position, Latch and/or Speed states, whichever are applicable according to the
             * feature flags set.
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
             *   - The effects of SetTarget and Step commands in a Closure Dimension Cluster associated with this
             *     cluster, as described in Section 5.4.4, “Association Between Closure Control and Closure Dimension
             *     Clusters”.
             *
             *   - The Stop command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.7.4
             */
            overallCurrentState: Attribute(0x3, TlvNullable(TlvOverallCurrentState), { default: null }),

            /**
             * Indicates the TargetPosition, TargetLatch and/or TargetSpeed values, whichever are applicable according
             * to the feature flags set.
             *
             * Null, if the state is unknown. For example after a reboot.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.7.5
             */
            overallTargetState: Attribute(0x4, TlvNullable(TlvOverallTargetState), { default: null })
        },

        commands: {
            /**
             * On receipt of this command, the closure shall operate to update its position, latch state and/or motion
             * speed.
             *
             * The rationale behind defining the conformance as being purely optional in the table above is to ensure
             * that commands containing one or more fields related to unsupported features are still accepted, rather
             * than being rejected outright. For example, if a simple client, which is not able to determine the
             * capabilities of the server, invokes a command that includes both position and speed, a server that does
             * not support the speed feature would simply ignore the speed field while still adjusting its position as
             * requested.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.8.2
             */
            moveTo: Command(0x1, TlvMoveToRequest, 0x1, TlvNoResponse, { timed: true })
        },

        events: {
            /**
             * This event shall be generated when a reportable error condition is detected. A closure that generates
             * this event shall also set the MainState attribute to Error, indicating an error condition.
             *
             * This event shall contain the following fields:
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.1
             */
            operationalError: Event(0x0, Priority.Critical, TlvOperationalErrorEvent),

            /**
             * This event, if supported, shall be generated when the SecureState field in the OverallCurrentState
             * attribute changes. It is used to indicate whether a closure is securing a space against possible
             * unauthorized entry.
             *
             * This event shall contain the following fields:
             *
             *   - True, when the closure is in a secure state, e.g. unauthorized/undetectable access is not possible.
             *
             *   - False, when the closure is in an insecure state, e.g. unauthorized/undetectable access is possible.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 5.4.9.4
             */
            secureStateChanged: Event(0x3, Priority.Info, TlvSecureStateChangedEvent)
        },

        /**
         * This metadata controls which ClosureControlCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { positioning: true, instantaneous: false }, component: PositioningNotInstantaneousComponent },
            { flags: { motionLatching: true }, component: MotionLatchingComponent },
            { flags: { instantaneous: false }, component: NotInstantaneousComponent },
            { flags: { manuallyOperable: true }, component: ManuallyOperableComponent },
            { flags: { calibration: true }, component: CalibrationComponent },
            { flags: { speed: true, positioning: false }, component: false },
            { flags: { speed: true, instantaneous: true }, component: false },
            { flags: { ventilation: true, positioning: false }, component: false },
            { flags: { pedestrian: true, positioning: false }, component: false },
            { flags: { calibration: true, positioning: false }, component: false },
            { flags: { positioning: false, motionLatching: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides an interface for controlling a Closure.
     *
     * Per the Matter specification you cannot use {@link ClosureControlCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.4
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const PS_NOT_IS = { positioning: true, instantaneous: false };
    const LT = { motionLatching: true };
    const MO = { manuallyOperable: true };
    const CL = { calibration: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            countdownTime: MutableCluster.AsConditional(
                PositioningNotInstantaneousComponent.attributes.countdownTime,
                { optionalIf: [PS_NOT_IS] }
            ),
            latchControlModes: MutableCluster.AsConditional(
                MotionLatchingComponent.attributes.latchControlModes,
                { mandatoryIf: [LT] }
            )
        },

        commands: {
            ...Base.commands,
            stop: MutableCluster.AsConditional(NotInstantaneousComponent.commands.stop, { mandatoryIf: [] }),
            calibrate: MutableCluster.AsConditional(CalibrationComponent.commands.calibrate, { mandatoryIf: [CL] })
        },

        events: {
            ...Base.events,
            movementCompleted: MutableCluster.AsConditional(
                NotInstantaneousComponent.events.movementCompleted,
                { mandatoryIf: [] }
            ),
            engageStateChanged: MutableCluster.AsConditional(
                ManuallyOperableComponent.events.engageStateChanged,
                { mandatoryIf: [MO] }
            )
        }
    });

    /**
     * This cluster supports all ClosureControl features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ClosureControlCluster = ClosureControl.Cluster;
export const ClosureControlCluster = ClosureControl.Cluster;
ClusterRegistry.register(ClosureControl.Complete);
