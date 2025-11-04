/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { WindowCovering } from "#clusters/window-covering";

export namespace WindowCoveringInterface {
    export interface Base {
        /**
         * Upon receipt of this command, the window covering will adjust its position so the physical lift/slide and
         * tilt is at the maximum open/up position. This will happen as fast as possible. The server attributes shall be
         * updated as follows:
         *
         * if the PositionAware feature is supported:
         *
         *   • TargetPositionLiftPercent100ths attribute shall be set to 0.00%.
         *
         *   • TargetPositionTiltPercent100ths attribute shall be set to 0.00%.
         *
         * The server positioning attributes will follow the movements, once the movement has successfully finished, the
         * server attributes shall be updated as follows:
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.1
         */
        upOrOpen(): MaybePromise;

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
         * The server positioning attributes will follow the movements, once the movement has successfully finished, the
         * server attributes shall be updated as follows:
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.2
         */
        downOrClose(): MaybePromise;

        /**
         * Upon receipt of this command, the window covering will stop any adjusting to the physical tilt and lift/slide
         * that is currently occurring. The server attributes supported shall be updated as follows:
         *
         *   • TargetPositionLiftPercent100ths attribute will be set to CurrentPositionLiftPercent100ths attribute
         *     value.
         *
         *   • TargetPositionTiltPercent100ths attribute will be set to CurrentPositionTiltPercent100ths attribute
         *     value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.3
         */
        stopMotion(): MaybePromise;
    }

    export interface Lift {
        /**
         * This command is used to set the target lift position of the window covering to the percentage value specified
         * in the command.
         *
         * Upon receipt of this command, the server will adjust the window covering to the lift/slide percentage
         * specified in the payload of this command.
         *
         * If the command includes LiftPercent100thsValue, then TargetPositionLiftPercent100ths attribute shall be set
         * to LiftPercent100thsValue. Otherwise the TargetPositionLiftPercent100ths attribute shall be set to
         * LiftPercentageValue * 100.
         *
         * If a client includes LiftPercent100thsValue in the command, the LiftPercentageValue shall be set to
         * LiftPercent100thsValue / 100, so a legacy server which only supports LiftPercentageValue (not
         * LiftPercent100thsValue) has a value to set the target position.
         *
         * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
         * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is only
         * a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
         * returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.5
         */
        goToLiftPercentage(request: WindowCovering.GoToLiftPercentageRequest): MaybePromise;
    }

    export interface Tilt {
        /**
         * This command is used to set the target tilt position of the window covering to the percentage value specified
         * in the command.
         *
         * Upon receipt of this command, the server will adjust the window covering to the tilt percentage specified in
         * the payload of this command.
         *
         * If the command includes TiltPercent100thsValue, then TargetPositionTiltPercent100ths attribute shall be set
         * to TiltPercent100thsValue. Otherwise the TargetPositionTiltPercent100ths attribute shall be set to
         * TiltPercentageValue * 100.
         *
         * If a client includes TiltPercent100thsValue in the command, the TiltPercentageValue shall be set to
         * TiltPercent100thsValue / 100, so a legacy server which only supports TiltPercentageValue (not
         * TiltPercent100thsValue) has a value to set the target position.
         *
         * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
         * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is only
         * a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
         * returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.7
         */
        goToTiltPercentage(request: WindowCovering.GoToTiltPercentageRequest): MaybePromise;
    }

    export interface LiftAndPositionAwareLift {
        /**
         * This command is used to set the target lift position of the window covering to the percentage value specified
         * in the command.
         *
         * Upon receipt of this command, the server will adjust the window covering to the lift/slide percentage
         * specified in the payload of this command.
         *
         * If the command includes LiftPercent100thsValue, then TargetPositionLiftPercent100ths attribute shall be set
         * to LiftPercent100thsValue. Otherwise the TargetPositionLiftPercent100ths attribute shall be set to
         * LiftPercentageValue * 100.
         *
         * If a client includes LiftPercent100thsValue in the command, the LiftPercentageValue shall be set to
         * LiftPercent100thsValue / 100, so a legacy server which only supports LiftPercentageValue (not
         * LiftPercent100thsValue) has a value to set the target position.
         *
         * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
         * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is only
         * a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
         * returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.5
         */
        goToLiftPercentage(request: WindowCovering.GoToLiftPercentageRequest): MaybePromise;
    }

    export interface TiltAndPositionAwareTilt {
        /**
         * This command is used to set the target tilt position of the window covering to the percentage value specified
         * in the command.
         *
         * Upon receipt of this command, the server will adjust the window covering to the tilt percentage specified in
         * the payload of this command.
         *
         * If the command includes TiltPercent100thsValue, then TargetPositionTiltPercent100ths attribute shall be set
         * to TiltPercent100thsValue. Otherwise the TargetPositionTiltPercent100ths attribute shall be set to
         * TiltPercentageValue * 100.
         *
         * If a client includes TiltPercent100thsValue in the command, the TiltPercentageValue shall be set to
         * TiltPercent100thsValue / 100, so a legacy server which only supports TiltPercentageValue (not
         * TiltPercent100thsValue) has a value to set the target position.
         *
         * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a
         * UpOrOpen command and a non-zero percentage shall be treated as an DownOrClose command. If the device is only
         * a tilt control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be
         * returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.7
         */
        goToTiltPercentage(request: WindowCovering.GoToTiltPercentageRequest): MaybePromise;
    }

    export interface LiftAndAbsolutePosition {
        /**
         * This command is used to set the target lift position of the window covering to the value specified in the
         * command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.4
         */
        goToLiftValue(request: WindowCovering.GoToLiftValueRequest): MaybePromise;
    }

    export interface TiltAndAbsolutePosition {
        /**
         * This command is used to set the target tilt position of the window covering to the value specified in the
         * command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.6
         */
        goToTiltValue(request: WindowCovering.GoToTiltValueRequest): MaybePromise;
    }
}

export type WindowCoveringInterface = {
    components: [
        { flags: {}, methods: WindowCoveringInterface.Base },
        { flags: { lift: true }, methods: WindowCoveringInterface.Lift },
        { flags: { tilt: true }, methods: WindowCoveringInterface.Tilt },
        { flags: { lift: true, positionAwareLift: true }, methods: WindowCoveringInterface.LiftAndPositionAwareLift },
        { flags: { tilt: true, positionAwareTilt: true }, methods: WindowCoveringInterface.TiltAndPositionAwareTilt },
        { flags: { lift: true, absolutePosition: true }, methods: WindowCoveringInterface.LiftAndAbsolutePosition },
        { flags: { tilt: true, absolutePosition: true }, methods: WindowCoveringInterface.TiltAndAbsolutePosition }
    ]
};
