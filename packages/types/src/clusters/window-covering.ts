/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    OptionalFixedAttribute,
    OptionalAttribute,
    Attribute,
    OptionalCommand,
    TlvNoResponse,
    Command,
    FixedAttribute,
    WritableAttribute
} from "../cluster/Cluster.js";
import { TlvUInt16, TlvPercent100ths, TlvPercent, TlvEnum, TlvUInt8, TlvBitmap } from "../tlv/TlvNumber.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { BitFlag, BitFieldEnum } from "../schema/BitmapSchema.js";
import { AccessLevel } from "#model";
import { TlvNoArguments } from "../tlv/TlvNoArguments.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace WindowCovering {
    /**
     * These are optional features supported by WindowCoveringCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.4
     */
    export enum Feature {
        /**
         * Lift (LF)
         *
         * The Lift feature applies to window coverings that lift up and down (e.g. for a roller shade, Up and Down is
         * lift Open and Close) or slide left to right (e.g. for a sliding curtain, Left and Right is lift Open and
         * Close).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.4.1
         */
        Lift = "Lift",

        /**
         * Tilt (TL)
         *
         * The Tilt feature applies to window coverings with vertical or horizontal strips.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.4.2
         */
        Tilt = "Tilt",

        /**
         * PositionAwareLift (PA_LF)
         *
         * Position aware lift control is supported.
         */
        PositionAwareLift = "PositionAwareLift",

        /**
         * AbsolutePosition (ABS)
         *
         * The percentage attributes shall indicate the position as a percentage between the InstalledOpenLimits and
         * InstalledClosedLimits attributes of the window covering starting at the open (0.00%).
         *
         * As a general rule, absolute positioning (in centimeters or tenth of a degrees) SHOULD NOT be supported for
         * new implementations.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.4.4
         */
        AbsolutePosition = "AbsolutePosition",

        /**
         * PositionAwareTilt (PA_TL)
         *
         * Position aware tilt control is supported.
         */
        PositionAwareTilt = "PositionAwareTilt"
    }

    /**
     * Input to the WindowCovering goToLiftPercentage command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.5
     */
    export const TlvGoToLiftPercentageRequest = TlvObject({ liftPercent100thsValue: TlvField(0, TlvPercent100ths) });

    /**
     * Input to the WindowCovering goToLiftPercentage command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.5
     */
    export interface GoToLiftPercentageRequest extends TypeFromSchema<typeof TlvGoToLiftPercentageRequest> {}

    /**
     * Input to the WindowCovering goToTiltPercentage command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.7
     */
    export const TlvGoToTiltPercentageRequest = TlvObject({ tiltPercent100thsValue: TlvField(0, TlvPercent100ths) });

    /**
     * Input to the WindowCovering goToTiltPercentage command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.7
     */
    export interface GoToTiltPercentageRequest extends TypeFromSchema<typeof TlvGoToTiltPercentageRequest> {}

    /**
     * Input to the WindowCovering goToLiftValue command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.4
     */
    export const TlvGoToLiftValueRequest = TlvObject({
        /**
         * This field shall specify the requested physical lift/slide position in unit cm (centimeters).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.4.1
         */
        liftValue: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the WindowCovering goToLiftValue command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.4
     */
    export interface GoToLiftValueRequest extends TypeFromSchema<typeof TlvGoToLiftValueRequest> {}

    /**
     * Input to the WindowCovering goToTiltValue command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.6
     */
    export const TlvGoToTiltValueRequest = TlvObject({
        /**
         * This field shall specify the requested physical tilt position in unit 0.1° (tenth of a degrees).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.6.1
         */
        tiltValue: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the WindowCovering goToTiltValue command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.6
     */
    export interface GoToTiltValueRequest extends TypeFromSchema<typeof TlvGoToTiltValueRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.5
     */
    export enum WindowCoveringType {
        /**
         * RollerShade
         */
        Rollershade = 0,

        /**
         * RollerShade - 2 Motor
         */
        Rollershade2Motor = 1,

        /**
         * RollerShade - Exterior
         */
        RollershadeExterior = 2,

        /**
         * RollerShade - Exterior - 2 Motor
         */
        RollershadeExterior2Motor = 3,

        /**
         * Drapery (curtain)
         */
        Drapery = 4,

        /**
         * Awning
         */
        Awning = 5,

        /**
         * Shutter
         */
        Shutter = 6,

        /**
         * Tilt Blind - Tilt Only
         */
        TiltBlindTiltOnly = 7,

        /**
         * Tilt Blind - Lift & Tilt
         */
        TiltBlindLift = 8,

        /**
         * Projector Screen
         */
        ProjectorScreen = 9,

        /**
         * Unknown
         */
        Unknown = 255
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1
     */
    export const ConfigStatus = {
        /**
         * Device is operational.
         *
         * This bit shall indicate whether the window covering is operational for regular use:
         *
         *   • 0 = Not Operational
         *
         *   • 1 = Operational
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1.1
         */
        operational: BitFlag(0),

        onlineReserved: BitFlag(1),

        /**
         * The lift movement is reversed.
         *
         * This bit shall indicate whether the lift movement is reversed:
         *
         *   • 0 = Lift movement is normal
         *
         *   • 1 = Lift movement is reversed
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1.2
         */
        liftMovementReversed: BitFlag(2),

        /**
         * Supports the PositionAwareLift feature (PA_LF).
         *
         * This bit shall indicate whether the window covering supports the PositionAwareLift feature:
         *
         *   • 0 = Lift control is not position aware
         *
         *   • 1 = Lift control is position aware (PA_LF)
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1.3
         */
        liftPositionAware: BitFlag(3),

        /**
         * Supports the PositionAwareTilt feature (PA_TL).
         *
         * This bit shall indicate whether the window covering supports the PositionAwareTilt feature:
         *
         *   • 0 = Tilt control is not position aware
         *
         *   • 1 = Tilt control is position aware (PA_TL)
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1.4
         */
        tiltPositionAware: BitFlag(4),

        /**
         * Uses an encoder for lift.
         *
         * This bit shall indicate whether a position aware controlled window covering is employing an encoder for
         * positioning the height of the window covering:
         *
         *   • 0 = Timer Controlled
         *
         *   • 1 = Encoder Controlled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1.5
         */
        liftEncoderControlled: BitFlag(5),

        /**
         * Uses an encoder for tilt.
         *
         * This bit shall indicate whether a position aware controlled window covering is employing an encoder for
         * tilting the window covering:
         *
         *   • 0 = Timer Controlled
         *
         *   • 1 = Encoder Controlled
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.1.6
         */
        tiltEncoderControlled: BitFlag(6)
    };

    /**
     * The OperationalStatusBitmap is using several internal operational state fields (composed of 2 bits) following
     * this definition:
     *
     *   • 00b = Currently not moving
     *
     *   • 01b = Currently opening (e.g. moving from closed to open).
     *
     *   • 10b = Currently closing (e.g. moving from open to closed).
     *
     *   • 11b = Reserved
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.3
     */
    export const OperationalStatus = {
        /**
         * Global operational state.
         *
         * These bits shall indicate in which direction the covering is currently moving or if it has stopped. Global
         * operational state shall always reflect the overall motion of the device.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.3.1
         */
        global: BitFieldEnum<MovementStatus>(0, 2),

        /**
         * Lift operational state.
         *
         * These bits shall indicate in which direction the covering’s lift is currently moving or if it has stopped.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.3.2
         */
        lift: BitFieldEnum<MovementStatus>(2, 2),

        /**
         * Tilt operational state.
         *
         * These bits shall indicate in which direction the covering’s tilt is currently moving or if it has stopped.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.3.3
         */
        tilt: BitFieldEnum<MovementStatus>(4, 2)
    };

    /**
     * Values for OperationalStatus attribute fields.
     */
    export enum MovementStatus {
        /**
         * Covering is not moving
         */
        Stopped = 0,

        /**
         * Covering is moving from closed to open
         */
        Opening = 1,

        /**
         * Covering is moving from open to closed
         */
        Closing = 2
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.6
     */
    export enum EndProductType {
        /**
         * Simple Roller Shade
         */
        RollerShade = 0,

        /**
         * Roman Shade
         */
        RomanShade = 1,

        /**
         * Balloon Shade
         */
        BalloonShade = 2,

        /**
         * Woven Wood
         */
        WovenWood = 3,

        /**
         * Pleated Shade
         */
        PleatedShade = 4,

        /**
         * Cellular Shade
         */
        CellularShade = 5,

        /**
         * Layered Shade
         */
        LayeredShade = 6,

        /**
         * Layered Shade 2D
         */
        LayeredShade2D = 7,

        /**
         * Sheer Shade
         */
        SheerShade = 8,

        /**
         * Tilt Only Interior Blind
         */
        TiltOnlyInteriorBlind = 9,

        /**
         * Interior Blind
         */
        InteriorBlind = 10,

        /**
         * Vertical Blind, Strip Curtain
         */
        VerticalBlindStripCurtain = 11,

        /**
         * Interior Venetian Blind
         */
        InteriorVenetianBlind = 12,

        /**
         * Exterior Venetian Blind
         */
        ExteriorVenetianBlind = 13,

        /**
         * Lateral Left Curtain
         */
        LateralLeftCurtain = 14,

        /**
         * Lateral Right Curtain
         */
        LateralRightCurtain = 15,

        /**
         * Central Curtain
         */
        CentralCurtain = 16,

        /**
         * Roller Shutter
         */
        RollerShutter = 17,

        /**
         * Exterior Vertical Screen
         */
        ExteriorVerticalScreen = 18,

        /**
         * Awning Terrace (Patio)
         */
        AwningTerracePatio = 19,

        /**
         * Awning Vertical Screen
         */
        AwningVerticalScreen = 20,

        /**
         * Tilt Only Pergola
         */
        TiltOnlyPergola = 21,

        /**
         * Swinging Shutter
         */
        SwingingShutter = 22,

        /**
         * Sliding Shutter
         */
        SlidingShutter = 23,

        /**
         * Unknown
         */
        Unknown = 255
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.2
     */
    export const Mode = {
        /**
         * Reverse the lift direction.
         *
         * This bit shall control the motor direction:
         *
         *   • 0 = Lift movement is normal
         *
         *   • 1 = Lift movement is reversed
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.2.1
         */
        motorDirectionReversed: BitFlag(0),

        /**
         * Perform a calibration.
         *
         * This bit shall set the window covering into calibration mode:
         *
         *   • 0 = Normal mode
         *
         *   • 1 = Calibration mode
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.2.2
         */
        calibrationMode: BitFlag(1),

        /**
         * Freeze all motions for maintenance.
         *
         * This bit shall set the window covering into maintenance mode:
         *
         *   • 0 = Normal mode
         *
         *   • 1 = Maintenance mode
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.2.3
         */
        maintenanceMode: BitFlag(2),

        /**
         * Control the LEDs feedback.
         *
         * This bit shall control feedback LEDs:
         *
         *   • 0 = LEDs are off
         *
         *   • 1 = LEDs will display feedback
         *
         * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.2.4
         */
        ledFeedback: BitFlag(3)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 5.3.5.4
     */
    export const SafetyStatus = {
        /**
         * Movement commands are ignored (locked out). e.g. not granted authorization, outside some time/date range.
         */
        remoteLockout: BitFlag(0),

        /**
         * Tampering detected on sensors or any other safety equipment. Ex: a device has been forcedly moved without its
         * actuator(s).
         */
        tamperDetection: BitFlag(1),

        /**
         * Communication failure to sensors or other safety equipment.
         */
        failedCommunication: BitFlag(2),

        /**
         * Device has failed to reach the desired position. e.g. with position aware device, time expired before
         * TargetPosition is reached.
         */
        positionFailure: BitFlag(3),

        /**
         * Motor(s) and/or electric circuit thermal protection activated.
         */
        thermalProtection: BitFlag(4),

        /**
         * An obstacle is preventing actuator movement.
         */
        obstacleDetected: BitFlag(5),

        /**
         * Device has power related issue or limitation e.g. device is running w/ the help of a backup battery or power
         * might not be fully available at the moment.
         */
        power: BitFlag(6),

        /**
         * Local safety sensor (not a direct obstacle) is preventing movements (e.g. Safety EU Standard EN60335).
         */
        stopInput: BitFlag(7),

        /**
         * Mechanical problem related to the motor(s) detected.
         */
        motorJammed: BitFlag(8),

        /**
         * PCB, fuse and other electrics problems.
         */
        hardwareFailure: BitFlag(9),

        /**
         * Actuator is manually operated and is preventing actuator movement (e.g. actuator is disengaged/decoupled).
         */
        manualOperation: BitFlag(10),

        /**
         * Protection is activated.
         */
        protection: BitFlag(11)
    };

    /**
     * A WindowCoveringCluster supports these elements if it supports features Lift, PositionAwareLift and
     * AbsolutePosition.
     */
    export const LiftAndPositionAwareLiftAndAbsolutePositionComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum possible encoder position possible (Unit cm, centimeters) to position the height of
             * the window covering lift.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.2
             */
            physicalClosedLimitLift: OptionalFixedAttribute(0x1, TlvUInt16, { default: 0 }),

            /**
             * Indicates the actual lift position (Unit cm, centimeters) of the window covering from the fully-open
             * position.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.4
             */
            currentPositionLift: OptionalAttribute(0x3, TlvNullable(TlvUInt16), { persistent: true, default: null }),

            /**
             * Indicates the open limit for lifting the window covering whether position (in centimeters) is encoded or
             * timed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.17
             */
            installedOpenLimitLift: Attribute(0x10, TlvUInt16.bound({ max: 65534 }), { persistent: true, default: 0 }),

            /**
             * Indicates the closed limit for lifting the window covering whether position (in centimeters) is encoded
             * or timed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.18
             */
            installedClosedLimitLift: Attribute(
                0x11,
                TlvUInt16.bound({ max: 65534 }),
                { persistent: true, default: 65534 }
            )
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports features Tilt, PositionAwareTilt and
     * AbsolutePosition.
     */
    export const TiltAndPositionAwareTiltAndAbsolutePositionComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum possible encoder position possible (Unit 0.1°, tenths of a degree) to position the
             * angle of the window covering tilt.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.3
             */
            physicalClosedLimitTilt: OptionalFixedAttribute(0x2, TlvUInt16, { default: 0 }),

            /**
             * Indicates the actual tilt position (Unit 0.1°, tenths of a degree) of the window covering from the
             * fully-open position.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.5
             */
            currentPositionTilt: OptionalAttribute(0x4, TlvNullable(TlvUInt16), { persistent: true, default: null }),

            /**
             * Indicates the open limit for tilting the window covering whether position (in tenth of a degree) is
             * encoded or timed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.19
             */
            installedOpenLimitTilt: Attribute(0x12, TlvUInt16.bound({ max: 65534 }), { persistent: true, default: 0 }),

            /**
             * Indicates the closed limit for tilting the window covering whether position (in tenth of a degree) is
             * encoded or timed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.20
             */
            installedClosedLimitTilt: Attribute(
                0x13,
                TlvUInt16.bound({ max: 65534 }),
                { persistent: true, default: 65534 }
            )
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports feature Lift.
     */
    export const LiftComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the total number of lift/slide actuations applied to the window covering since the device was
             * installed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.6
             */
            numberOfActuationsLift: OptionalAttribute(0x5, TlvUInt16, { persistent: true, default: 0 })
        },

        commands: {
            /**
             * This command is used to set the target lift position of the window covering to the percentage value
             * specified in the command.
             *
             * Upon receipt of this command, the server will adjust the window covering to the lift/slide percentage
             * specified in the payload of this command.
             *
             * If the command includes LiftPercent100thsValue, then TargetPositionLiftPercent100ths attribute shall be
             * set to LiftPercent100thsValue. Otherwise the TargetPositionLiftPercent100ths attribute shall be set to
             * LiftPercentageValue * 100.
             *
             * If a client includes LiftPercent100thsValue in the command, the LiftPercentageValue shall be set to
             * LiftPercent100thsValue / 100, so a legacy server which only supports LiftPercentageValue (not
             * LiftPercent100thsValue) has a value to set the target position.
             *
             * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
             * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is
             * only a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
             * returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.5
             */
            goToLiftPercentage: OptionalCommand(0x5, TlvGoToLiftPercentageRequest, 0x5, TlvNoResponse)
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports feature Tilt.
     */
    export const TiltComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the total number of tilt actuations applied to the window covering since the device was
             * installed.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.7
             */
            numberOfActuationsTilt: OptionalAttribute(0x6, TlvUInt16, { persistent: true, default: 0 })
        },

        commands: {
            /**
             * This command is used to set the target tilt position of the window covering to the percentage value
             * specified in the command.
             *
             * Upon receipt of this command, the server will adjust the window covering to the tilt percentage specified
             * in the payload of this command.
             *
             * If the command includes TiltPercent100thsValue, then TargetPositionTiltPercent100ths attribute shall be
             * set to TiltPercent100thsValue. Otherwise the TargetPositionTiltPercent100ths attribute shall be set to
             * TiltPercentageValue * 100.
             *
             * If a client includes TiltPercent100thsValue in the command, the TiltPercentageValue shall be set to
             * TiltPercent100thsValue / 100, so a legacy server which only supports TiltPercentageValue (not
             * TiltPercent100thsValue) has a value to set the target position.
             *
             * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
             * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is
             * only a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
             * returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.7
             */
            goToTiltPercentage: OptionalCommand(0x8, TlvGoToTiltPercentageRequest, 0x8, TlvNoResponse)
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports features Lift and PositionAwareLift.
     */
    export const LiftAndPositionAwareLiftComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute is
             * equal to CurrentPositionLiftPercent100ths attribute divided by 100.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.11
             */
            currentPositionLiftPercentage: OptionalAttribute(
                0x8,
                TlvNullable(TlvPercent),
                { persistent: true, default: null }
            ),

            /**
             * Indicates the position where the window covering lift will go or is moving to as a percentage (Unit
             * 0.01%).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.13
             */
            targetPositionLiftPercent100ths: Attribute(0xb, TlvNullable(TlvPercent100ths), { default: null }),

            /**
             * Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals 100.00%.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.9
             */
            currentPositionLiftPercent100ths: Attribute(
                0xe,
                TlvNullable(TlvPercent100ths),
                { persistent: true, default: null }
            )
        },

        commands: {
            /**
             * This command is used to set the target lift position of the window covering to the percentage value
             * specified in the command.
             *
             * Upon receipt of this command, the server will adjust the window covering to the lift/slide percentage
             * specified in the payload of this command.
             *
             * If the command includes LiftPercent100thsValue, then TargetPositionLiftPercent100ths attribute shall be
             * set to LiftPercent100thsValue. Otherwise the TargetPositionLiftPercent100ths attribute shall be set to
             * LiftPercentageValue * 100.
             *
             * If a client includes LiftPercent100thsValue in the command, the LiftPercentageValue shall be set to
             * LiftPercent100thsValue / 100, so a legacy server which only supports LiftPercentageValue (not
             * LiftPercent100thsValue) has a value to set the target position.
             *
             * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
             * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is
             * only a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
             * returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.5
             */
            goToLiftPercentage: Command(0x5, TlvGoToLiftPercentageRequest, 0x5, TlvNoResponse)
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports features Tilt and PositionAwareTilt.
     */
    export const TiltAndPositionAwareTiltComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute is
             * equal to CurrentPositionTiltPercent100ths attribute divided by 100.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.12
             */
            currentPositionTiltPercentage: OptionalAttribute(
                0x9,
                TlvNullable(TlvPercent),
                { persistent: true, default: null }
            ),

            /**
             * Indicates the position where the window covering tilt will go or is moving to as a percentage (Unit
             * 0.01%).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.14
             */
            targetPositionTiltPercent100ths: Attribute(0xc, TlvNullable(TlvPercent100ths), { default: null }),

            /**
             * Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals 100.00%.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.10
             */
            currentPositionTiltPercent100ths: Attribute(
                0xf,
                TlvNullable(TlvPercent100ths),
                { persistent: true, default: null }
            )
        },

        commands: {
            /**
             * This command is used to set the target tilt position of the window covering to the percentage value
             * specified in the command.
             *
             * Upon receipt of this command, the server will adjust the window covering to the tilt percentage specified
             * in the payload of this command.
             *
             * If the command includes TiltPercent100thsValue, then TargetPositionTiltPercent100ths attribute shall be
             * set to TiltPercent100thsValue. Otherwise the TargetPositionTiltPercent100ths attribute shall be set to
             * TiltPercentageValue * 100.
             *
             * If a client includes TiltPercent100thsValue in the command, the TiltPercentageValue shall be set to
             * TiltPercent100thsValue / 100, so a legacy server which only supports TiltPercentageValue (not
             * TiltPercent100thsValue) has a value to set the target position.
             *
             * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
             * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is
             * only a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
             * returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.7
             */
            goToTiltPercentage: Command(0x8, TlvGoToTiltPercentageRequest, 0x8, TlvNoResponse)
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports features Lift and AbsolutePosition.
     */
    export const LiftAndAbsolutePositionComponent = MutableCluster.Component({
        commands: {
            /**
             * This command is used to set the target lift position of the window covering to the value specified in the
             * command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.4
             */
            goToLiftValue: OptionalCommand(0x4, TlvGoToLiftValueRequest, 0x4, TlvNoResponse)
        }
    });

    /**
     * A WindowCoveringCluster supports these elements if it supports features Tilt and AbsolutePosition.
     */
    export const TiltAndAbsolutePositionComponent = MutableCluster.Component({
        commands: {
            /**
             * This command is used to set the target tilt position of the window covering to the value specified in the
             * command.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.6
             */
            goToTiltValue: OptionalCommand(0x7, TlvGoToTiltValueRequest, 0x7, TlvNoResponse)
        }
    });

    /**
     * These elements and properties are present in all WindowCovering clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x102,
        name: "WindowCovering",
        revision: 6,

        features: {
            /**
             * The Lift feature applies to window coverings that lift up and down (e.g. for a roller shade, Up and Down
             * is lift Open and Close) or slide left to right (e.g. for a sliding curtain, Left and Right is lift Open
             * and Close).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.4.1
             */
            lift: BitFlag(0),

            /**
             * The Tilt feature applies to window coverings with vertical or horizontal strips.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.4.2
             */
            tilt: BitFlag(1),

            /**
             * Position aware lift control is supported.
             */
            positionAwareLift: BitFlag(2),

            /**
             * The percentage attributes shall indicate the position as a percentage between the InstalledOpenLimits and
             * InstalledClosedLimits attributes of the window covering starting at the open (0.00%).
             *
             * As a general rule, absolute positioning (in centimeters or tenth of a degrees) SHOULD NOT be supported
             * for new implementations.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.4.4
             */
            absolutePosition: BitFlag(3),

            /**
             * Position aware tilt control is supported.
             */
            positionAwareTilt: BitFlag(4)
        },

        attributes: {
            /**
             * This attribute shall identify the type of window covering.
             *
             * If the window covering supports the LF feature and not the TL feature, the following types shall be used
             * as the constraint for this attribute:
             *
             * If the window covering supports the TL feature and not the LF feature, the following types shall be used
             * as the constraint for this attribute:
             *
             * If the window covering supports both the LF and TL features, the following types are allowed to be used:
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.1
             */
            type: FixedAttribute(0x0, TlvEnum<WindowCoveringType>(), { default: WindowCoveringType.Rollershade }),

            /**
             * This attribute specifies the configuration and status information of the window covering.
             *
             * To change settings, devices shall write to the Mode attribute. The behavior causing the setting or
             * clearing of each bit is vendor specific.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.8
             */
            configStatus: Attribute(0x7, TlvBitmap(TlvUInt8, ConfigStatus), { persistent: true }),

            /**
             * Indicates the currently ongoing operations and applies to all type of devices.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.15
             */
            operationalStatus: Attribute(0xa, TlvBitmap(TlvUInt8, OperationalStatus)),

            /**
             * This attribute SHOULD provide more detail about the product type than can be determined from the main
             * category indicated by the Type attribute.
             *
             * If the window covering supports the LF feature and not the TL feature, the following types shall be used
             * as the constraint for this attribute:
             *
             * If the window covering supports the TL feature and not the LF feature, the following types shall be used
             * as the constraint for this attribute:
             *
             * If the window covering supports both the LF and TL features, the following types are allowed to be used:
             *
             * The table below helps to match the EndProductType attribute with the Type attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.16
             */
            endProductType: FixedAttribute(0xd, TlvEnum<EndProductType>(), { default: EndProductType.RollerShade }),

            /**
             * The Mode attribute allows configuration of the window covering, such as: reversing the motor direction,
             * placing the window covering into calibration mode, placing the motor into maintenance mode, disabling the
             * network, and disabling status LEDs.
             *
             * In the case a device does not support or implement a specific mode, e.g. the device has a specific
             * installation method and reversal is not relevant or the device does not include a maintenance mode, any
             * write interaction to the Mode attribute, with an unsupported mode bit or any out of bounds bits set, must
             * be ignored and a response containing the status of CONSTRAINT_ERROR will be returned.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.21
             */
            mode: WritableAttribute(
                0x17,
                TlvBitmap(TlvUInt8, Mode),
                { persistent: true, writeAcl: AccessLevel.Manage }
            ),

            /**
             * The SafetyStatus attribute reflects the state of the safety sensors and the common issues preventing
             * movements. By default for nominal operation all flags are cleared (0). A device might support none, one
             * or several bit flags from this attribute (all optional).
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.6.22
             */
            safetyStatus: OptionalAttribute(0x1a, TlvBitmap(TlvUInt16, SafetyStatus))
        },

        commands: {
            /**
             * Upon receipt of this command, the window covering will adjust its position so the physical lift/slide and
             * tilt is at the maximum open/up position. This will happen as fast as possible. The server attributes
             * shall be updated as follows:
             *
             * if the PositionAware feature is supported:
             *
             *   • TargetPositionLiftPercent100ths attribute shall be set to 0.00%.
             *
             *   • TargetPositionTiltPercent100ths attribute shall be set to 0.00%.
             *
             * The server positioning attributes will follow the movements, once the movement has successfully finished,
             * the server attributes shall be updated as follows:
             *
             * if the PositionAware feature is supported:
             *
             *   • CurrentPositionLiftPercent100ths attribute shall be 0.00%.
             *
             *   • CurrentPositionLiftPercentage attribute shall be 0%.
             *
             *   • CurrentPositionTiltPercent100ths attribute shall be 0.00%.
             *
             *   • CurrentPositionTiltPercentage attribute shall be 0%.
             *
             * if the AbsolutePosition feature is supported:
             *
             *   • CurrentPositionLift attribute shall be equal to the InstalledOpenLimitLift attribute.
             *
             *   • CurrentPositionTilt attribute shall be equal to the InstalledOpenLimitTilt attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.1
             */
            upOrOpen: Command(0x0, TlvNoArguments, 0x0, TlvNoResponse),

            /**
             * Upon receipt of this command, the window covering will adjust its position so the physical lift/slide and
             * tilt is at the maximum closed/down position. This will happen as fast as possible. The server attributes
             * supported shall be updated as follows:
             *
             * if the PositionAware feature is supported:
             *
             *   • TargetPositionLiftPercent100ths attribute shall be set to 100.00%.
             *
             *   • TargetPositionTiltPercent100ths attribute shall be set to 100.00%.
             *
             * The server positioning attributes will follow the movements, once the movement has successfully finished,
             * the server attributes shall be updated as follows:
             *
             * if the PositionAware feature is supported:
             *
             *   • CurrentPositionLiftPercent100ths attribute shall be 100.00%.
             *
             *   • CurrentPositionLiftPercentage attribute shall be 100%.
             *
             *   • CurrentPositionTiltPercent100ths attribute shall be 100.00%.
             *
             *   • CurrentPositionTiltPercentage attribute shall be 100%.
             *
             * if the AbsolutePosition feature is supported:
             *
             *   • CurrentPositionLift attribute shall be equal to the InstalledClosedLimitLift attribute.
             *
             *   • CurrentPositionTilt attribute shall be equal to the InstalledClosedLimitTilt attribute.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.2
             */
            downOrClose: Command(0x1, TlvNoArguments, 0x1, TlvNoResponse),

            /**
             * Upon receipt of this command, the window covering will stop any adjusting to the physical tilt and
             * lift/slide that is currently occurring. The server attributes supported shall be updated as follows:
             *
             *   • TargetPositionLiftPercent100ths attribute will be set to CurrentPositionLiftPercent100ths attribute
             *     value.
             *
             *   • TargetPositionTiltPercent100ths attribute will be set to CurrentPositionTiltPercent100ths attribute
             *     value.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 5.3.7.3
             */
            stopMotion: Command(0x2, TlvNoArguments, 0x2, TlvNoResponse)
        },

        /**
         * This metadata controls which WindowCoveringCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            {
                flags: { lift: true, positionAwareLift: true, absolutePosition: true },
                component: LiftAndPositionAwareLiftAndAbsolutePositionComponent
            },
            {
                flags: { tilt: true, positionAwareTilt: true, absolutePosition: true },
                component: TiltAndPositionAwareTiltAndAbsolutePositionComponent
            },
            { flags: { lift: true }, component: LiftComponent },
            { flags: { tilt: true }, component: TiltComponent },
            { flags: { lift: true, positionAwareLift: true }, component: LiftAndPositionAwareLiftComponent },
            { flags: { tilt: true, positionAwareTilt: true }, component: TiltAndPositionAwareTiltComponent },
            { flags: { lift: true, absolutePosition: true }, component: LiftAndAbsolutePositionComponent },
            { flags: { tilt: true, absolutePosition: true }, component: TiltAndAbsolutePositionComponent },
            { flags: { positionAwareLift: true, lift: false }, component: false },
            { flags: { positionAwareTilt: true, tilt: false }, component: false },
            { flags: { lift: false, tilt: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * The window covering cluster provides an interface for controlling and adjusting automatic window coverings such
     * as drapery motors, automatic shades, curtains and blinds.
     *
     * Per the Matter specification you cannot use {@link WindowCoveringCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 5.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const LF_PA_LF_ABS = { lift: true, positionAwareLift: true, absolutePosition: true };
    const TL_PA_TL_ABS = { tilt: true, positionAwareTilt: true, absolutePosition: true };
    const LF = { lift: true };
    const TL = { tilt: true };
    const LF_PA_LF = { lift: true, positionAwareLift: true };
    const TL_PA_TL = { tilt: true, positionAwareTilt: true };
    const LF_ABS = { lift: true, absolutePosition: true };
    const TL_ABS = { tilt: true, absolutePosition: true };

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
            physicalClosedLimitLift: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftAndAbsolutePositionComponent.attributes.physicalClosedLimitLift,
                { optionalIf: [LF_PA_LF_ABS] }
            ),
            physicalClosedLimitTilt: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltAndAbsolutePositionComponent.attributes.physicalClosedLimitTilt,
                { optionalIf: [TL_PA_TL_ABS] }
            ),
            currentPositionLift: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftAndAbsolutePositionComponent.attributes.currentPositionLift,
                { optionalIf: [LF_PA_LF_ABS] }
            ),
            currentPositionTilt: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltAndAbsolutePositionComponent.attributes.currentPositionTilt,
                { optionalIf: [TL_PA_TL_ABS] }
            ),
            numberOfActuationsLift: MutableCluster.AsConditional(
                LiftComponent.attributes.numberOfActuationsLift,
                { optionalIf: [LF] }
            ),
            numberOfActuationsTilt: MutableCluster.AsConditional(
                TiltComponent.attributes.numberOfActuationsTilt,
                { optionalIf: [TL] }
            ),
            currentPositionLiftPercentage: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftComponent.attributes.currentPositionLiftPercentage,
                { optionalIf: [LF_PA_LF] }
            ),
            currentPositionTiltPercentage: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltComponent.attributes.currentPositionTiltPercentage,
                { optionalIf: [TL_PA_TL] }
            ),
            targetPositionLiftPercent100ths: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftComponent.attributes.targetPositionLiftPercent100ths,
                { mandatoryIf: [LF_PA_LF] }
            ),
            targetPositionTiltPercent100ths: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltComponent.attributes.targetPositionTiltPercent100ths,
                { mandatoryIf: [TL_PA_TL] }
            ),
            currentPositionLiftPercent100ths: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftComponent.attributes.currentPositionLiftPercent100ths,
                { mandatoryIf: [LF_PA_LF] }
            ),
            currentPositionTiltPercent100ths: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltComponent.attributes.currentPositionTiltPercent100ths,
                { mandatoryIf: [TL_PA_TL] }
            ),
            installedOpenLimitLift: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftAndAbsolutePositionComponent.attributes.installedOpenLimitLift,
                { mandatoryIf: [LF_PA_LF_ABS] }
            ),
            installedClosedLimitLift: MutableCluster.AsConditional(
                LiftAndPositionAwareLiftAndAbsolutePositionComponent.attributes.installedClosedLimitLift,
                { mandatoryIf: [LF_PA_LF_ABS] }
            ),
            installedOpenLimitTilt: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltAndAbsolutePositionComponent.attributes.installedOpenLimitTilt,
                { mandatoryIf: [TL_PA_TL_ABS] }
            ),
            installedClosedLimitTilt: MutableCluster.AsConditional(
                TiltAndPositionAwareTiltAndAbsolutePositionComponent.attributes.installedClosedLimitTilt,
                { mandatoryIf: [TL_PA_TL_ABS] }
            )
        },

        commands: {
            ...Base.commands,
            goToLiftValue: MutableCluster.AsConditional(
                LiftAndAbsolutePositionComponent.commands.goToLiftValue,
                { optionalIf: [LF_ABS] }
            ),
            goToLiftPercentage: MutableCluster.AsConditional(
                LiftComponent.commands.goToLiftPercentage,
                { optionalIf: [LF], mandatoryIf: [LF_PA_LF] }
            ),
            goToTiltValue: MutableCluster.AsConditional(
                TiltAndAbsolutePositionComponent.commands.goToTiltValue,
                { optionalIf: [TL_ABS] }
            ),
            goToTiltPercentage: MutableCluster.AsConditional(
                TiltComponent.commands.goToTiltPercentage,
                { optionalIf: [TL], mandatoryIf: [TL_PA_TL] }
            )
        }
    });

    /**
     * This cluster supports all WindowCovering features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type WindowCoveringCluster = WindowCovering.Cluster;
export const WindowCoveringCluster = WindowCovering.Cluster;
ClusterRegistry.register(WindowCovering.Complete);
