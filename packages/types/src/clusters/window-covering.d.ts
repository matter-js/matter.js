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

/**
 * Definitions for the WindowCovering cluster.
 *
 * The window covering cluster provides an interface for controlling and adjusting automatic window coverings such as
 * drapery motors, automatic shades, curtains and blinds.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 5.3
 */
export declare namespace WindowCovering {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0102;

    /**
     * Textual cluster identifier.
     */
    export const name: "WindowCovering";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 6;

    /**
     * Canonical metadata for the WindowCovering cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link WindowCovering} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall identify the type of window covering.
         *
         * If the window covering supports the LF feature and not the TL feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports the TL feature and not the LF feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports both the LF and TL features, the following types are allowed to be used:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.1
         */
        type: WindowCoveringType;

        /**
         * This attribute specifies the configuration and status information of the window covering.
         *
         * To change settings, devices shall write to the Mode attribute. The behavior causing the setting or clearing
         * of each bit is vendor specific.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.8
         */
        configStatus: ConfigStatus;

        /**
         * Indicates the currently ongoing operations and applies to all type of devices.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.15
         */
        operationalStatus: OperationalStatus;

        /**
         * This attribute SHOULD provide more detail about the product type than can be determined from the main
         * category indicated by the Type attribute.
         *
         * If the window covering supports the LF feature and not the TL feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports the TL feature and not the LF feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports both the LF and TL features, the following types are allowed to be used:
         *
         * The table below helps to match the EndProductType attribute with the Type attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.16
         */
        endProductType: EndProductType;

        /**
         * The Mode attribute allows configuration of the window covering, such as: reversing the motor direction,
         * placing the window covering into calibration mode, placing the motor into maintenance mode, disabling the
         * network, and disabling status LEDs.
         *
         * In the case a device does not support or implement a specific mode, e.g. the device has a specific
         * installation method and reversal is not relevant or the device does not include a maintenance mode, any write
         * interaction to the Mode attribute, with an unsupported mode bit or any out of bounds bits set, must be
         * ignored and a response containing the status of CONSTRAINT_ERROR will be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.21
         */
        mode: Mode;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        velocityLift?: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        accelerationTimeLift?: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        decelerationTimeLift?: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        intermediateSetpointsLift?: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        intermediateSetpointsTilt?: any;

        /**
         * The SafetyStatus attribute reflects the state of the safety sensors and the common issues preventing
         * movements. By default for nominal operation all flags are cleared (0). A device might support none, one or
         * several bit flags from this attribute (all optional).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.22
         */
        safetyStatus?: SafetyStatus;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature
     * "LiftAndPositionAwareLiftAndAbsolutePosition".
     */
    export interface LiftAndPositionAwareLiftAndAbsolutePositionAttributes {
        /**
         * Indicates the open limit for lifting the window covering whether position (in centimeters) is encoded or
         * timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.17
         */
        installedOpenLimitLift: number;

        /**
         * Indicates the closed limit for lifting the window covering whether position (in centimeters) is encoded or
         * timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.18
         */
        installedClosedLimitLift: number;

        /**
         * Indicates the maximum possible encoder position possible (Unit cm, centimeters) to position the height of the
         * window covering lift.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.2
         */
        physicalClosedLimitLift?: number;

        /**
         * Indicates the actual lift position (Unit cm, centimeters) of the window covering from the fully-open
         * position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.4
         */
        currentPositionLift?: number | null;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature
     * "TiltAndPositionAwareTiltAndAbsolutePosition".
     */
    export interface TiltAndPositionAwareTiltAndAbsolutePositionAttributes {
        /**
         * Indicates the open limit for tilting the window covering whether position (in tenth of a degree) is encoded
         * or timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.19
         */
        installedOpenLimitTilt: number;

        /**
         * Indicates the closed limit for tilting the window covering whether position (in tenth of a degree) is encoded
         * or timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.20
         */
        installedClosedLimitTilt: number;

        /**
         * Indicates the maximum possible encoder position possible (Unit 0.1°, tenths of a degree) to position the
         * angle of the window covering tilt.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.3
         */
        physicalClosedLimitTilt?: number;

        /**
         * Indicates the actual tilt position (Unit 0.1°, tenths of a degree) of the window covering from the fully-open
         * position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.5
         */
        currentPositionTilt?: number | null;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "Lift".
     */
    export interface LiftAttributes {
        /**
         * Indicates the total number of lift/slide actuations applied to the window covering since the device was
         * installed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.6
         */
        numberOfActuationsLift?: number;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "Tilt".
     */
    export interface TiltAttributes {
        /**
         * Indicates the total number of tilt actuations applied to the window covering since the device was installed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.7
         */
        numberOfActuationsTilt?: number;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "LiftAndPositionAwareLift".
     */
    export interface LiftAndPositionAwareLiftAttributes {
        /**
         * Indicates the position where the window covering lift will go or is moving to as a percentage (Unit 0.01%).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.13
         */
        targetPositionLiftPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals 100.00%.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.9
         */
        currentPositionLiftPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute is equal
         * to CurrentPositionLiftPercent100ths attribute divided by 100.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.11
         */
        currentPositionLiftPercentage?: number | null;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "TiltAndPositionAwareTilt".
     */
    export interface TiltAndPositionAwareTiltAttributes {
        /**
         * Indicates the position where the window covering tilt will go or is moving to as a percentage (Unit 0.01%).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.14
         */
        targetPositionTiltPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals 100.00%.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.10
         */
        currentPositionTiltPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute is equal
         * to CurrentPositionTiltPercent100ths attribute divided by 100.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.12
         */
        currentPositionTiltPercentage?: number | null;
    }

    /**
     * Attributes that may appear in {@link WindowCovering}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall identify the type of window covering.
         *
         * If the window covering supports the LF feature and not the TL feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports the TL feature and not the LF feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports both the LF and TL features, the following types are allowed to be used:
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.1
         */
        type: WindowCoveringType;

        /**
         * This attribute specifies the configuration and status information of the window covering.
         *
         * To change settings, devices shall write to the Mode attribute. The behavior causing the setting or clearing
         * of each bit is vendor specific.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.8
         */
        configStatus: ConfigStatus;

        /**
         * Indicates the currently ongoing operations and applies to all type of devices.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.15
         */
        operationalStatus: OperationalStatus;

        /**
         * This attribute SHOULD provide more detail about the product type than can be determined from the main
         * category indicated by the Type attribute.
         *
         * If the window covering supports the LF feature and not the TL feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports the TL feature and not the LF feature, the following types shall be used as
         * the constraint for this attribute:
         *
         * If the window covering supports both the LF and TL features, the following types are allowed to be used:
         *
         * The table below helps to match the EndProductType attribute with the Type attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.16
         */
        endProductType: EndProductType;

        /**
         * The Mode attribute allows configuration of the window covering, such as: reversing the motor direction,
         * placing the window covering into calibration mode, placing the motor into maintenance mode, disabling the
         * network, and disabling status LEDs.
         *
         * In the case a device does not support or implement a specific mode, e.g. the device has a specific
         * installation method and reversal is not relevant or the device does not include a maintenance mode, any write
         * interaction to the Mode attribute, with an unsupported mode bit or any out of bounds bits set, must be
         * ignored and a response containing the status of CONSTRAINT_ERROR will be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.21
         */
        mode: Mode;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        velocityLift: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        accelerationTimeLift: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        decelerationTimeLift: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        intermediateSetpointsLift: any;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6
         * @deprecated
         */
        intermediateSetpointsTilt: any;

        /**
         * The SafetyStatus attribute reflects the state of the safety sensors and the common issues preventing
         * movements. By default for nominal operation all flags are cleared (0). A device might support none, one or
         * several bit flags from this attribute (all optional).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.22
         */
        safetyStatus: SafetyStatus;

        /**
         * Indicates the open limit for lifting the window covering whether position (in centimeters) is encoded or
         * timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.17
         */
        installedOpenLimitLift: number;

        /**
         * Indicates the closed limit for lifting the window covering whether position (in centimeters) is encoded or
         * timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.18
         */
        installedClosedLimitLift: number;

        /**
         * Indicates the maximum possible encoder position possible (Unit cm, centimeters) to position the height of the
         * window covering lift.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.2
         */
        physicalClosedLimitLift: number;

        /**
         * Indicates the actual lift position (Unit cm, centimeters) of the window covering from the fully-open
         * position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.4
         */
        currentPositionLift: number | null;

        /**
         * Indicates the open limit for tilting the window covering whether position (in tenth of a degree) is encoded
         * or timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.19
         */
        installedOpenLimitTilt: number;

        /**
         * Indicates the closed limit for tilting the window covering whether position (in tenth of a degree) is encoded
         * or timed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.20
         */
        installedClosedLimitTilt: number;

        /**
         * Indicates the maximum possible encoder position possible (Unit 0.1°, tenths of a degree) to position the
         * angle of the window covering tilt.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.3
         */
        physicalClosedLimitTilt: number;

        /**
         * Indicates the actual tilt position (Unit 0.1°, tenths of a degree) of the window covering from the fully-open
         * position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.5
         */
        currentPositionTilt: number | null;

        /**
         * Indicates the total number of lift/slide actuations applied to the window covering since the device was
         * installed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.6
         */
        numberOfActuationsLift: number;

        /**
         * Indicates the total number of tilt actuations applied to the window covering since the device was installed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.7
         */
        numberOfActuationsTilt: number;

        /**
         * Indicates the position where the window covering lift will go or is moving to as a percentage (Unit 0.01%).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.13
         */
        targetPositionLiftPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals 100.00%.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.9
         */
        currentPositionLiftPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute is equal
         * to CurrentPositionLiftPercent100ths attribute divided by 100.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.11
         */
        currentPositionLiftPercentage: number | null;

        /**
         * Indicates the position where the window covering tilt will go or is moving to as a percentage (Unit 0.01%).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.14
         */
        targetPositionTiltPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage with a minimal step of 0.01%. E.g Max 10000 equals 100.00%.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.10
         */
        currentPositionTiltPercent100ths: number | null;

        /**
         * Indicates the actual position as a percentage from 0% to 100% with 1% default step. This attribute is equal
         * to CurrentPositionTiltPercent100ths attribute divided by 100.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.6.12
         */
        currentPositionTiltPercentage: number | null;
    }

    /**
     * {@link WindowCovering} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt of this command, the window covering will adjust its position so the physical lift/slide and
         * tilt is at the maximum open/up position. This will happen as fast as possible. The server attributes shall be
         * updated as follows:
         *
         * if the PositionAware feature is supported:
         *
         *   - TargetPositionLiftPercent100ths attribute shall be set to 0.00%.
         *
         *   - TargetPositionTiltPercent100ths attribute shall be set to 0.00%.
         *
         * The server positioning attributes will follow the movements, once the movement has successfully finished, the
         * server attributes shall be updated as follows:
         *
         * if the PositionAware feature is supported:
         *
         *   - CurrentPositionLiftPercent100ths attribute shall be 0.00%.
         *
         *   - CurrentPositionLiftPercentage attribute shall be 0%.
         *
         *   - CurrentPositionTiltPercent100ths attribute shall be 0.00%.
         *
         *   - CurrentPositionTiltPercentage attribute shall be 0%.
         *
         * if the AbsolutePosition feature is supported:
         *
         *   - CurrentPositionLift attribute shall be equal to the InstalledOpenLimitLift attribute.
         *
         *   - CurrentPositionTilt attribute shall be equal to the InstalledOpenLimitTilt attribute.
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
         *   - TargetPositionLiftPercent100ths attribute shall be set to 100.00%.
         *
         *   - TargetPositionTiltPercent100ths attribute shall be set to 100.00%.
         *
         * The server positioning attributes will follow the movements, once the movement has successfully finished, the
         * server attributes shall be updated as follows:
         *
         * if the PositionAware feature is supported:
         *
         *   - CurrentPositionLiftPercent100ths attribute shall be 100.00%.
         *
         *   - CurrentPositionLiftPercentage attribute shall be 100%.
         *
         *   - CurrentPositionTiltPercent100ths attribute shall be 100.00%.
         *
         *   - CurrentPositionTiltPercentage attribute shall be 100%.
         *
         * if the AbsolutePosition feature is supported:
         *
         *   - CurrentPositionLift attribute shall be equal to the InstalledClosedLimitLift attribute.
         *
         *   - CurrentPositionTilt attribute shall be equal to the InstalledClosedLimitTilt attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.2
         */
        downOrClose(): MaybePromise;

        /**
         * Upon receipt of this command, the window covering will stop any adjusting to the physical tilt and lift/slide
         * that is currently occurring. The server attributes supported shall be updated as follows:
         *
         *   - TargetPositionLiftPercent100ths attribute will be set to CurrentPositionLiftPercent100ths attribute
         *     value.
         *
         *   - TargetPositionTiltPercent100ths attribute will be set to CurrentPositionTiltPercent100ths attribute
         *     value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.3
         */
        stopMotion(): MaybePromise;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "Lift".
     */
    export interface LiftCommands {
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
        goToLiftPercentage(request: GoToLiftPercentageRequest): MaybePromise;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "Tilt".
     */
    export interface TiltCommands {
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
        goToTiltPercentage(request: GoToTiltPercentageRequest): MaybePromise;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "LiftAndPositionAwareLift".
     */
    export interface LiftAndPositionAwareLiftCommands {
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
        goToLiftPercentage(request: GoToLiftPercentageRequest): MaybePromise;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "TiltAndPositionAwareTilt".
     */
    export interface TiltAndPositionAwareTiltCommands {
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
        goToTiltPercentage(request: GoToTiltPercentageRequest): MaybePromise;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "LiftAndAbsolutePosition".
     */
    export interface LiftAndAbsolutePositionCommands {
        /**
         * This command is used to set the target lift position of the window covering to the value specified in the
         * command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.4
         */
        goToLiftValue(request: GoToLiftValueRequest): MaybePromise;
    }

    /**
     * {@link WindowCovering} supports these elements if it supports feature "TiltAndAbsolutePosition".
     */
    export interface TiltAndAbsolutePositionCommands {
        /**
         * This command is used to set the target tilt position of the window covering to the value specified in the
         * command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.6
         */
        goToTiltValue(request: GoToTiltValueRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link WindowCovering}.
     */
    export interface Commands extends
        BaseCommands,
        LiftCommands,
        TiltCommands,
        LiftAndPositionAwareLiftCommands,
        TiltAndPositionAwareTiltCommands,
        LiftAndAbsolutePositionCommands,
        TiltAndAbsolutePositionCommands
    {}

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands },
        {
            flags: { lift: true, positionAwareLift: true, absolutePosition: true },
            attributes: LiftAndPositionAwareLiftAndAbsolutePositionAttributes
        },
        {
            flags: { tilt: true, positionAwareTilt: true, absolutePosition: true },
            attributes: TiltAndPositionAwareTiltAndAbsolutePositionAttributes
        },
        { flags: { lift: true }, attributes: LiftAttributes, commands: LiftCommands },
        { flags: { tilt: true }, attributes: TiltAttributes, commands: TiltCommands },
        {
            flags: { lift: true, positionAwareLift: true },
            attributes: LiftAndPositionAwareLiftAttributes,
            commands: LiftAndPositionAwareLiftCommands
        },
        {
            flags: { tilt: true, positionAwareTilt: true },
            attributes: TiltAndPositionAwareTiltAttributes,
            commands: TiltAndPositionAwareTiltCommands
        },
        { flags: { lift: true, absolutePosition: true }, commands: LiftAndAbsolutePositionCommands },
        { flags: { tilt: true, absolutePosition: true }, commands: TiltAndAbsolutePositionCommands }
    ];

    export type Features = "Lift" | "Tilt" | "PositionAwareLift" | "AbsolutePosition" | "PositionAwareTilt";

    /**
     * These are optional features supported by WindowCoveringCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.4
     */
    export enum Feature {
        /**
         * Lift (LF)
         *
         * The Lift feature applies to window coverings that lift up and down (e.g. for a roller shade, Up and Down is
         * lift Open and Close) or slide left to right (e.g. for a sliding curtain, Left and Right is lift Open and
         * Close).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.4.1
         */
        Lift = "Lift",

        /**
         * Tilt (TL)
         *
         * The Tilt feature applies to window coverings with vertical or horizontal strips.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.4.2
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
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.4.4
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.5
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1
     */
    export interface ConfigStatus {
        /**
         * Device is operational.
         *
         * This bit shall indicate whether the window covering is operational for regular use:
         *
         *   - 0 = Not Operational
         *
         *   - 1 = Operational
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1.1
         */
        operational?: boolean;

        onlineReserved?: boolean;

        /**
         * The lift movement is reversed.
         *
         * This bit shall indicate whether the lift movement is reversed:
         *
         *   - 0 = Lift movement is normal
         *
         *   - 1 = Lift movement is reversed
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1.2
         */
        liftMovementReversed?: boolean;

        /**
         * Supports the PositionAwareLift feature (PA_LF).
         *
         * This bit shall indicate whether the window covering supports the PositionAwareLift feature:
         *
         *   - 0 = Lift control is not position aware
         *
         *   - 1 = Lift control is position aware (PA_LF)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1.3
         */
        liftPositionAware?: boolean;

        /**
         * Supports the PositionAwareTilt feature (PA_TL).
         *
         * This bit shall indicate whether the window covering supports the PositionAwareTilt feature:
         *
         *   - 0 = Tilt control is not position aware
         *
         *   - 1 = Tilt control is position aware (PA_TL)
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1.4
         */
        tiltPositionAware?: boolean;

        /**
         * Uses an encoder for lift.
         *
         * This bit shall indicate whether a position aware controlled window covering is employing an encoder for
         * positioning the height of the window covering:
         *
         *   - 0 = Timer Controlled
         *
         *   - 1 = Encoder Controlled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1.5
         */
        liftEncoderControlled?: boolean;

        /**
         * Uses an encoder for tilt.
         *
         * This bit shall indicate whether a position aware controlled window covering is employing an encoder for
         * tilting the window covering:
         *
         *   - 0 = Timer Controlled
         *
         *   - 1 = Encoder Controlled
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.1.6
         */
        tiltEncoderControlled?: boolean;
    }

    /**
     * The OperationalStatusBitmap is using several internal operational state fields (composed of 2 bits) following
     * this definition:
     *
     *   - 00b = Currently not moving
     *
     *   - 01b = Currently opening (e.g. moving from closed to open).
     *
     *   - 10b = Currently closing (e.g. moving from open to closed).
     *
     *   - 11b = Reserved
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.3
     */
    export interface OperationalStatus {
        /**
         * Global operational state.
         *
         * These bits shall indicate in which direction the covering is currently moving or if it has stopped. Global
         * operational state shall always reflect the overall motion of the device.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.3.1
         */
        global?: MovementStatus;

        /**
         * Lift operational state.
         *
         * These bits shall indicate in which direction the covering’s lift is currently moving or if it has stopped.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.3.2
         */
        lift?: MovementStatus;

        /**
         * Tilt operational state.
         *
         * These bits shall indicate in which direction the covering’s tilt is currently moving or if it has stopped.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.3.3
         */
        tilt?: MovementStatus;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.6
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
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.2
     */
    export interface Mode {
        /**
         * Reverse the lift direction.
         *
         * This bit shall control the motor direction:
         *
         *   - 0 = Lift movement is normal
         *
         *   - 1 = Lift movement is reversed
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.2.1
         */
        motorDirectionReversed?: boolean;

        /**
         * Perform a calibration.
         *
         * This bit shall set the window covering into calibration mode:
         *
         *   - 0 = Normal mode
         *
         *   - 1 = Calibration mode
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.2.2
         */
        calibrationMode?: boolean;

        /**
         * Freeze all motions for maintenance.
         *
         * This bit shall set the window covering into maintenance mode:
         *
         *   - 0 = Normal mode
         *
         *   - 1 = Maintenance mode
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.2.3
         */
        maintenanceMode?: boolean;

        /**
         * Control the LEDs feedback.
         *
         * This bit shall control feedback LEDs:
         *
         *   - 0 = LEDs are off
         *
         *   - 1 = LEDs will display feedback
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.2.4
         */
        ledFeedback?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.5.4
     */
    export interface SafetyStatus {
        /**
         * Movement commands are ignored (locked out). e.g. not granted authorization, outside some time/date range.
         */
        remoteLockout?: boolean;

        /**
         * Tampering detected on sensors or any other safety equipment. Ex: a device has been forcedly moved without its
         * actuator(s).
         */
        tamperDetection?: boolean;

        /**
         * Communication failure to sensors or other safety equipment.
         */
        failedCommunication?: boolean;

        /**
         * Device has failed to reach the desired position. e.g. with position aware device, time expired before
         * TargetPosition is reached.
         */
        positionFailure?: boolean;

        /**
         * Motor(s) and/or electric circuit thermal protection activated.
         */
        thermalProtection?: boolean;

        /**
         * An obstacle is preventing actuator movement.
         */
        obstacleDetected?: boolean;

        /**
         * Device has power related issue or limitation e.g. device is running w/ the help of a backup battery or power
         * might not be fully available at the moment.
         */
        power?: boolean;

        /**
         * Local safety sensor (not a direct obstacle) is preventing movements (e.g. Safety EU Standard EN60335).
         */
        stopInput?: boolean;

        /**
         * Mechanical problem related to the motor(s) detected.
         */
        motorJammed?: boolean;

        /**
         * PCB, fuse and other electrics problems.
         */
        hardwareFailure?: boolean;

        /**
         * Actuator is manually operated and is preventing actuator movement (e.g. actuator is disengaged/decoupled).
         */
        manualOperation?: boolean;

        /**
         * Protection is activated.
         */
        protection?: boolean;
    }

    /**
     * This command is used to set the target lift position of the window covering to the percentage value specified in
     * the command.
     *
     * Upon receipt of this command, the server will adjust the window covering to the lift/slide percentage specified
     * in the payload of this command.
     *
     * If the command includes LiftPercent100thsValue, then TargetPositionLiftPercent100ths attribute shall be set to
     * LiftPercent100thsValue. Otherwise the TargetPositionLiftPercent100ths attribute shall be set to
     * LiftPercentageValue * 100.
     *
     * If a client includes LiftPercent100thsValue in the command, the LiftPercentageValue shall be set to
     * LiftPercent100thsValue / 100, so a legacy server which only supports LiftPercentageValue (not
     * LiftPercent100thsValue) has a value to set the target position.
     *
     * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a UpOrOpen
     * command and a non-zero percentage shall be treated as an DownOrClose command. If the device is only a tilt
     * control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.5
     */
    export interface GoToLiftPercentageRequest {
        liftPercent100thsValue: number;
    }

    /**
     * This command is used to set the target tilt position of the window covering to the percentage value specified in
     * the command.
     *
     * Upon receipt of this command, the server will adjust the window covering to the tilt percentage specified in the
     * payload of this command.
     *
     * If the command includes TiltPercent100thsValue, then TargetPositionTiltPercent100ths attribute shall be set to
     * TiltPercent100thsValue. Otherwise the TargetPositionTiltPercent100ths attribute shall be set to
     * TiltPercentageValue * 100.
     *
     * If a client includes TiltPercent100thsValue in the command, the TiltPercentageValue shall be set to
     * TiltPercent100thsValue / 100, so a legacy server which only supports TiltPercentageValue (not
     * TiltPercent100thsValue) has a value to set the target position.
     *
     * If the server does not support the PositionAware feature, then a zero percentage shall be treated as a UpOrOpen
     * command and a non-zero percentage shall be treated as an DownOrClose command. If the device is only a tilt
     * control device, then the command SHOULD be ignored and a UNSUPPORTED_COMMAND status SHOULD be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.7
     */
    export interface GoToTiltPercentageRequest {
        tiltPercent100thsValue: number;
    }

    /**
     * This command is used to set the target lift position of the window covering to the value specified in the
     * command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.4
     */
    export interface GoToLiftValueRequest {
        /**
         * This field shall specify the requested physical lift/slide position in unit cm (centimeters).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.4.1
         */
        liftValue: number;
    }

    /**
     * This command is used to set the target tilt position of the window covering to the value specified in the
     * command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.6
     */
    export interface GoToTiltValueRequest {
        /**
         * This field shall specify the requested physical tilt position in unit 0.1° (tenth of a degrees).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.3.7.6.1
         */
        tiltValue: number;
    }

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
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link WindowCovering}.
     */
    export const Cluster: typeof WindowCovering;

    /**
     * @deprecated Use {@link WindowCovering}.
     */
    export const Complete: typeof WindowCovering;

    export const Typing: WindowCovering;
}

/**
 * @deprecated Use {@link WindowCovering}.
 */
export declare const WindowCoveringCluster: typeof WindowCovering;

export interface WindowCovering extends ClusterTyping {
    Attributes: WindowCovering.Attributes;
    Commands: WindowCovering.Commands;
    Features: WindowCovering.Features;
    Components: WindowCovering.Components;
}
