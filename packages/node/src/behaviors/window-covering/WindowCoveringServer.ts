/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindowCovering } from "#clusters/window-covering";
import { Diagnostic, ImplementationError, isDeepEqual, Logger, MaybePromise } from "#general";
import { ClusterType, StatusCode, StatusResponseError, TypeFromPartialBitSchema } from "#types";
import { WindowCoveringBehavior } from "./WindowCoveringBehavior.js";

const logger = Logger.get("WindowCoveringServer");

const WindowCoveringBase = WindowCoveringBehavior.with(
    WindowCovering.Feature.Lift,
    WindowCovering.Feature.Tilt,
    WindowCovering.Feature.PositionAwareLift,
    WindowCovering.Feature.PositionAwareTilt,
);

/** What element should move? */
export enum MovementType {
    Lift,
    Tilt,
}

/** Status of the Calibration mode. */
export enum CalibrationMode {
    Enabled,
    Running,
    Disabled,
}

/**
 * Direction the Window covering should move.
 * The special state "DefinedByPosition" is used to indicate that the direction should be determined by the target
 * position and the implementation needs to determine it himself.
 */
export enum MovementDirection {
    Open,
    Close,
    DefinedByPosition,
}

const WC_PERCENT100THS_MIN_OPEN = 0;
const WC_PERCENT100THS_MAX_CLOSED = 10000;
const WC_PERCENT100THS_COEFFICIENT = 100;

/**
 * This is the default server implementation of {@link WindowCoveringBehavior}.
 *
 * This implementation includes all features of {@link WindowCovering.Cluster} and implements all mandatory commands.
 * You should use {@link WindowCoveringServer.with} to specialize the class for the features your implementation
 * supports.
 *
 * If you enable position awareness (positionAware* features), the default logic automatically syncs current positions
 * and operational state when the currentPosition*Percent100ths attributes change. You should update
 * currentPosition*Percent100ths with the actual position from your device.  This updates other attributes
 * automatically.
 *
 * When targetPosition*Percent100ths attributes change, operational state updates bases on the current and target
 * values.
 *
 * If you do not override {@link handleMovement} the default implementation updates current position to the target
 * position immediately.
 *
 * In addition to Matter attributes, {@link WindowCoveringBaseServer.State} includes the following configuration
 * properties:
 *
 *   * supportsMaintenanceMode (default true): Set to false if the device has no maintenance mode
 *
 * The internal state allows to configure implementation details when extending the class:
 *   * supportsCalibration (default false): Set to true if the device supports calibration. You must implement
 {@link WindowCoveringBaseServer.executeCalibration} to perform actual calibration.
 *   * disableOperationalModeHandling (default false): Set to true if you want to handle the operational status yourself
 *
 * When developing for specific hardware you should extend {@link WindowCoveringServer} and implement the following
 * methods to map movement to your device. The default implementation maps Matter commands to these methods. The benefit
 * of this structure is that basic data validations and option checks are already done and you can focus on the actual
 * hardware interaction:
 *
 *   * {@link WindowCoveringBaseServer.handleMovement} Logic to actually move the device. Via Parameters the movement
 *     type (Lift/Tilt), direction, target percentage and information if motor is configured reversed are provided. When
 *     the device moves the current Positions (if supported by the device) are updated with the movement. The
 *     operational state is automatically updated by the default implementation based on current and target values of
 *     the cluster state.
 *
 *   * {@link WindowCoveringBaseServer.handleStopMovement} Logic to stop any movement of the device. You can use the
 *     super.handleStopMovement() to set the target positions to the current positions or do this yourself.
 *
 *   * {@link WindowCoveringBaseServer.executeCalibration} If supported, override this method to implement the
 *     calibration process. The default implementation returns an error to indicate calibration is unsupported. If
 *     unsupported you should also add a Changing event handler to the mode attribute to ensure calibration mode is not
 *     set (needs to throw an ConstraintError).
 *
 * IMPORTANT NOTE:
 *
 * This default implementation could have pitfalls when the calibration process and/or movement is handled via
 * long-running promises. There could be edge cases not correctly handled by the current implementation when it comes
 * to long-running movements or calibration processes - especially when these processes are long-running async JS
 * operations.
 *
 * A movement coming in while another movement is still running is assumed to be handled by the device. It is not
 * handled here. If this causes you trouble please provide feedback, and we can discuss how to improve the default
 * implementation.
 */
export class WindowCoveringBaseServer extends WindowCoveringBase {
    declare protected internal: WindowCoveringBaseServer.Internal;
    declare state: WindowCoveringBaseServer.State;

    override initialize(): MaybePromise {
        // Initialize Internal state from the Mode attribute and keep in sync
        this.internal.inMaintenanceMode = !!this.state.mode.maintenanceMode;
        this.internal.calibrationMode =
            this.state.mode.calibrationMode && !this.state.mode.maintenanceMode
                ? CalibrationMode.Enabled
                : CalibrationMode.Disabled;
        this.reactTo(this.events.mode$Changing, this.#handleModeChanging);

        // Sync ConfigStatus with features ans set mode to operational if not in maintenance or calibration
        const configStatus = this.state.configStatus;
        configStatus.operational = !this.internal.inMaintenanceMode && !this.state.mode.calibrationMode;
        if (this.features.lift) {
            if (this.features.positionAwareLift) {
                configStatus.liftPositionAware = true;
            }
        }
        if (this.features.tilt) {
            if (this.features.positionAwareTilt) {
                configStatus.tiltPositionAware = true;
            }
        }
        if (!isDeepEqual(configStatus, this.state.configStatus)) {
            this.state.configStatus = configStatus;
        }

        // Initially sync the target positions with the current positions, so we have no movement
        if (this.features.tilt) {
            this.state.targetPositionTiltPercent100ths = this.state.currentPositionTiltPercent100ths;
        }
        if (this.features.lift) {
            this.state.targetPositionLiftPercent100ths = this.state.currentPositionLiftPercent100ths;
        }

        if (!this.internal.disableOperationalModeHandling) {
            // Keep position attributes (percentage and also absolute position) and operational state in sync
            this.reactTo(this.events.currentPositionLiftPercent100ths$Changing, this.#syncLiftCurrentPositions);
            this.reactTo(this.events.currentPositionTiltPercent100ths$Changing, this.#syncTiltCurrentPositions);

            // Update operational state when target position changes
            this.reactTo(this.events.targetPositionLiftPercent100ths$Changing, this.#handleLiftTargetPositionChanging);
            this.reactTo(this.events.targetPositionTiltPercent100ths$Changing, this.#handleTiltTargetPositionChanging);

            // Update the global operational status when lift or tilt status changes
            this.reactTo(this.events.operationalStatus$Changing, this.#handleOperationalStatusChanging);
        }
    }

    /**
     * Sync the mode attribute with the configStatus attribute and the internal state.
     */
    #handleModeChanging(mode: TypeFromPartialBitSchema<typeof WindowCovering.Mode>) {
        // According to chip implementation maintenance mode has priority over calibration mode
        if (mode.maintenanceMode && mode.calibrationMode) {
            mode.calibrationMode = false;
        }
        if (mode.maintenanceMode && !this.state.supportsMaintenanceMode) {
            throw new StatusResponseError("Maintenance mode not supported", StatusCode.ConstraintError);
        }
        this.internal.inMaintenanceMode = !!mode.maintenanceMode;

        if (mode.calibrationMode) {
            if (!this.internal.supportsCalibration) {
                throw new StatusResponseError("Calibration not supported", StatusCode.ConstraintError);
            }
            if (this.internal.calibrationMode === CalibrationMode.Running) {
                // What to do here? For now lets leave unchanged
            } else {
                this.internal.calibrationMode = CalibrationMode.Enabled;
            }
        } else {
            this.internal.calibrationMode = CalibrationMode.Disabled;
        }

        const configStatus = this.state.configStatus;
        configStatus.operational =
            !mode.maintenanceMode || (mode.calibrationMode && !this.internal.supportsCalibration);
        configStatus.liftMovementReversed = !!mode.motorDirectionReversed;
        if (isDeepEqual(configStatus, this.state.configStatus)) {
            this.agent.asLocalActor(() => {
                this.state.configStatus = configStatus;
            });
        }

        logger.debug(
            `Mode changed to ${Diagnostic.json(mode)} and config status to ${Diagnostic.json(configStatus)} and internal calibration mode to ${this.internal.calibrationMode}`,
        );
    }

    /** Update the global operational status based on the lift or tilt status. */
    #handleOperationalStatusChanging(
        operationalStatus: TypeFromPartialBitSchema<typeof WindowCovering.OperationalStatus>,
    ) {
        // Global tracks lift if moving otherwise it follows tilt
        const globalStatus =
            operationalStatus.lift !== WindowCovering.MovementStatus.Stopped
                ? operationalStatus.lift
                : operationalStatus.tilt;
        operationalStatus.global = globalStatus;
        logger.debug(
            `Operational status changed to ${Diagnostic.json(operationalStatus)} with new global status ${globalStatus}`,
        );
        this.state.operationalStatus = operationalStatus;
    }

    /** Update the operational state when the target lift position changes. */
    #handleLiftTargetPositionChanging(percent100ths: number | null) {
        if (this.features.positionAwareLift) {
            this.state.operationalStatus.lift = this.#computeOperationalState(
                percent100ths,
                this.state.currentPositionLiftPercent100ths,
            );
        }
    }

    /** Update the operational state when the target tilt position changes. */
    #handleTiltTargetPositionChanging(percent100ths: number | null) {
        if (this.features.positionAwareTilt) {
            this.state.operationalStatus.tilt = this.#computeOperationalState(
                percent100ths,
                this.state.currentPositionTiltPercent100ths,
            );
        }
    }

    /** Sync the current lift position attributes and the operational state. */
    #syncLiftCurrentPositions(percent100ths: number | null) {
        if (this.features.positionAwareLift) {
            this.state.currentPositionLiftPercentage =
                percent100ths === null ? percent100ths : Math.floor(percent100ths / WC_PERCENT100THS_COEFFICIENT);
            if (
                this.state.operationalStatus.lift !== WindowCovering.MovementStatus.Stopped &&
                percent100ths === this.state.targetPositionLiftPercent100ths
            ) {
                this.state.operationalStatus.lift = WindowCovering.MovementStatus.Stopped;
                logger.debug("Lift movement stopped, target value reached");
            }
        }
        logger.debug(
            `Syncing lift position ${this.state.currentPositionLiftPercent100ths === null ? null : (this.state.currentPositionLiftPercent100ths / 100).toFixed(2)} to ${this.state.currentPositionLiftPercentage}%`,
        );
    }

    /** Sync the current tilt position attributes and the operational state. */
    #syncTiltCurrentPositions(percent100ths: number | null) {
        if (this.features.positionAwareTilt) {
            this.state.currentPositionTiltPercentage =
                percent100ths === null ? percent100ths : Math.floor(percent100ths / WC_PERCENT100THS_COEFFICIENT);
            if (
                this.state.operationalStatus.tilt !== WindowCovering.MovementStatus.Stopped &&
                percent100ths === this.state.targetPositionTiltPercent100ths
            ) {
                this.state.operationalStatus.tilt = WindowCovering.MovementStatus.Stopped;
                logger.debug("Tilt movement stopped, target value reached");
            }
        }
        logger.debug(
            `Syncing tilt position ${this.state.currentPositionTiltPercent100ths === null ? null : (this.state.currentPositionTiltPercent100ths / 100).toFixed(2)} to ${this.state.currentPositionTiltPercentage}%`,
        );
    }

    /** Compute the operational state based on the current and target position. */
    #computeOperationalState(target: number | null, current: number | null) {
        if (current === null || target === null) {
            return WindowCovering.MovementStatus.Stopped;
        } else if (current === target) {
            return WindowCovering.MovementStatus.Stopped;
        } else if (current < target) {
            return WindowCovering.MovementStatus.Closing;
        } else {
            return WindowCovering.MovementStatus.Opening;
        }
    }

    /**
     * Asserts if the device can be controlled or not because of an active Maintenance mode or a calibration is
     * required but not supported.
     */
    #assertMotionLockStatus() {
        if (this.internal.inMaintenanceMode) {
            throw new StatusResponseError("Device is in maintenance mode", StatusCode.Busy);
        }

        switch (this.internal.calibrationMode) {
            case CalibrationMode.Enabled:
                if (!this.internal.supportsCalibration) {
                    // Should never happy normally because mode attribute should never be set
                    throw new StatusResponseError("Calibration not implemented", StatusCode.Failure);
                }
                break;
            case CalibrationMode.Running:
                // Calibration already in progress, not defined what to return here
                break;
            case CalibrationMode.Disabled:
                break;
        }

        if (!this.state.configStatus.operational) {
            throw new StatusResponseError("Device is not operational", StatusCode.Failure);
        }
    }

    /**
     * Calibrate the device.  The default implementation takes no action. Override to implement calibration if
     * necessary.
     *
     * @protected
     */
    protected executeCalibration(): MaybePromise {}

    /**
     * Perform actual "movement".  Override to initiate movement of your device.
     * The logic tries to determine the direction to Open or Close also when a target percentage is given. The direction
     * value `DefinedByPosition` only is set if we can not determine the direction based on the current data.
     * When a `targetPercent100ths` is set (not undefined) then this is the target value to use.
     *
     * The default implementation logs and immediately updates current position to the target positions.  This is
     * probably not desirable for a real device so do not invoke `super.handleMovement()` from your implementation.
     *
     * @param type Which element should move, Lift or Tilt
     * @param reversed If the motor is configured reversed
     * @param direction The direction of the movement (Open, Close, DefinedByPosition)
     * @param targetPercent100ths Optionally the target position in percent 100ths. It depends on the used feature set
     * of the cluster if this is provided or not.
     *
     * @protected
     */
    protected handleMovement(
        type: MovementType,
        reversed: boolean,
        direction: MovementDirection,
        targetPercent100ths?: number,
    ): MaybePromise {
        if (this.internal.disableOperationalModeHandling) {
            return;
        }
        switch (type) {
            case MovementType.Lift:
                if (this.features.positionAwareLift) {
                    if (targetPercent100ths === undefined) {
                        throw new ImplementationError("Target position must be defined for position aware lift");
                    }
                    this.state.currentPositionLiftPercent100ths = targetPercent100ths;
                }
                break;

            case MovementType.Tilt:
                if (this.features.positionAwareTilt) {
                    if (targetPercent100ths === undefined) {
                        throw new ImplementationError("Target position must be defined for position aware lift");
                    }
                    this.state.currentPositionTiltPercent100ths = targetPercent100ths;
                }
                break;
        }
        const directionInfo =
            direction === MovementDirection.DefinedByPosition
                ? ` in direction by position`
                : ` in direction ${direction === MovementDirection.Close ? "Close" : "Open"}`;
        const targetInfo =
            targetPercent100ths === undefined ? "" : ` to target position ${(targetPercent100ths / 100).toFixed(2)}`;
        logger.debug(
            `Moving the device ${type === MovementType.Lift ? "Lift" : "Tilt"}${directionInfo} (reversed=${reversed})${targetInfo}`,
        );
    }

    /**
     * Handle a movement. If calibration is supported and needed then {@link executeCalibration} runs before the actual
     * movement. The method increases the numberOfActuations* attribute and updates the operational status.
     *
     * Actual movement occurs in {@link handleMovement} as a worker. Thus, this method returns before actual movement
     * completes.
     */
    #prepareMovement(type: MovementType, direction: MovementDirection, targetPercent100ths?: number): void {
        if (this.internal.supportsCalibration && this.internal.calibrationMode === CalibrationMode.Enabled) {
            return this.env.runtime.add(this.#executeCalibrationAndMove(type, direction, targetPercent100ths));
        }
        if (type === MovementType.Lift && this.state.configStatus.liftMovementReversed) {
            logger.debug("Lift movement is reversed");
        }

        switch (type) {
            case MovementType.Lift:
                this.state.numberOfActuationsLift = (this.state.numberOfActuationsLift ?? 0) + 1;
                if (
                    this.features.positionAwareLift &&
                    direction === MovementDirection.DefinedByPosition &&
                    targetPercent100ths !== undefined &&
                    this.state.currentPositionLiftPercent100ths !== null
                ) {
                    direction =
                        targetPercent100ths > this.state.currentPositionLiftPercent100ths
                            ? MovementDirection.Close
                            : MovementDirection.Open;
                }
                if (
                    !this.internal.disableOperationalModeHandling &&
                    direction !== MovementDirection.DefinedByPosition
                ) {
                    this.state.operationalStatus.lift =
                        direction === MovementDirection.Close
                            ? WindowCovering.MovementStatus.Closing
                            : WindowCovering.MovementStatus.Opening;
                }
                break;

            case MovementType.Tilt:
                this.state.numberOfActuationsTilt = (this.state.numberOfActuationsTilt ?? 0) + 1;
                if (
                    this.features.positionAwareLift &&
                    direction === MovementDirection.DefinedByPosition &&
                    targetPercent100ths !== undefined &&
                    this.state.currentPositionTiltPercent100ths !== null
                ) {
                    direction =
                        targetPercent100ths > this.state.currentPositionTiltPercent100ths
                            ? MovementDirection.Close
                            : MovementDirection.Open;
                }
                if (
                    !this.internal.disableOperationalModeHandling &&
                    direction !== MovementDirection.DefinedByPosition
                ) {
                    this.state.operationalStatus.tilt =
                        direction === MovementDirection.Close
                            ? WindowCovering.MovementStatus.Closing
                            : WindowCovering.MovementStatus.Opening;
                }
                break;
        }

        this.env.runtime.add(
            this.handleMovement(
                type,
                type === MovementType.Lift && !!this.state.configStatus.liftMovementReversed,
                direction,
                targetPercent100ths,
            ),
        );
    }

    #executeCalibrationAndMove(type: MovementType, direction: MovementDirection, targetPercent100ths?: number) {
        let calibration;
        if (this.internal.calibrationMode === CalibrationMode.Enabled && this.internal.supportsCalibration) {
            this.internal.calibrationMode = CalibrationMode.Running;
            calibration = this.executeCalibration();
        }
        return MaybePromise.then(calibration, () => {
            this.internal.calibrationMode = CalibrationMode.Disabled;
            return this.#prepareMovement(type, direction, targetPercent100ths);
        });
    }

    /**
     * Stop device movement.  Sets the target position to the current position and updates operational state. Override
     * to implement the actual stop movement logic.
     *
     * If you update the current positions you can include the default logic via "super.handleStopMovement()".
     *
     * @protected
     */
    protected handleStopMovement(): MaybePromise {
        if (this.internal.disableOperationalModeHandling) {
            return;
        }
        if (this.features.positionAwareLift) {
            this.state.targetPositionLiftPercent100ths = this.state.currentPositionLiftPercent100ths;
        }
        if (this.features.positionAwareTilt) {
            this.state.targetPositionTiltPercent100ths = this.state.currentPositionTiltPercent100ths;
        }
        if (!this.features.positionAwareLift && !this.features.positionAwareTilt) {
            this.state.operationalStatus = {
                global: WindowCovering.MovementStatus.Stopped,
                lift: WindowCovering.MovementStatus.Stopped,
                tilt: WindowCovering.MovementStatus.Stopped,
            };
        }
    }

    #triggerLiftMotion(direction: MovementDirection, targetPercent100ths?: number) {
        this.#prepareMovement(MovementType.Lift, direction, targetPercent100ths);
    }

    #triggerTiltMotion(direction: MovementDirection, targetPercent100ths?: number) {
        this.#prepareMovement(MovementType.Tilt, direction, targetPercent100ths);
    }

    /**
     * Move the WindowCovering up or open. For position aware devices the target position is set to 0%. The method calls
     * the handleMovement method to actually move the device.
     */
    override upOrOpen(): MaybePromise {
        this.#assertMotionLockStatus();

        let targetLiftPercent100ths;
        let targetTiltPercent100ths;
        if (this.features.positionAwareLift) {
            this.state.targetPositionLiftPercent100ths = targetLiftPercent100ths = WC_PERCENT100THS_MIN_OPEN;
        }
        if (this.features.positionAwareTilt) {
            this.state.targetPositionTiltPercent100ths = targetTiltPercent100ths = WC_PERCENT100THS_MIN_OPEN;
        }

        if (this.features.lift) {
            this.#triggerLiftMotion(MovementDirection.Open, targetLiftPercent100ths);
        }
        if (this.features.tilt) {
            this.#triggerTiltMotion(MovementDirection.Open, targetTiltPercent100ths);
        }
    }

    /**
     * Move the WindowCovering down or close. For position aware devices the target position is set to 100%. The method
     * calls the handleMovement method to actually move the device.
     */
    override downOrClose(): MaybePromise {
        this.#assertMotionLockStatus();

        let targetLiftPercent100ths;
        let targetTiltPercent100ths;
        if (this.features.positionAwareLift) {
            this.state.targetPositionLiftPercent100ths = targetLiftPercent100ths = WC_PERCENT100THS_MAX_CLOSED;
        }
        if (this.features.positionAwareTilt) {
            this.state.targetPositionTiltPercent100ths = targetTiltPercent100ths = WC_PERCENT100THS_MAX_CLOSED;
        }

        if (this.features.lift) {
            this.#triggerLiftMotion(MovementDirection.Close, targetLiftPercent100ths);
        }
        if (this.features.tilt) {
            this.#triggerTiltMotion(MovementDirection.Close, targetTiltPercent100ths);
        }
    }

    /**
     * Stop any movement of the WindowCovering. The method calls the handleStopMovement method to actually stop the
     * movement of the device.
     */
    override stopMotion(): MaybePromise {
        this.#assertMotionLockStatus();

        return this.handleStopMovement();
    }

    /**
     * Move the WindowCovering to a specific tilt value. The method calls the handleMovement method to actually move the
     * device to the defined position.
     */
    override goToLiftPercentage({ liftPercent100thsValue }: WindowCovering.GoToLiftPercentageRequest): MaybePromise {
        this.#assertMotionLockStatus();

        if (this.features.positionAwareLift) {
            this.state.targetPositionLiftPercent100ths = liftPercent100thsValue;
            this.#triggerLiftMotion(
                MovementDirection.DefinedByPosition,
                this.state.targetPositionLiftPercent100ths ?? undefined,
            );
        } else {
            if (liftPercent100thsValue === 0) {
                this.upOrOpen();
            } else {
                this.downOrClose();
            }
        }
    }

    /**
     * Move the WindowCovering to a specific tilt value. The method calls the handleMovement method to actually move the
     * device to the defined position.
     */
    override goToTiltPercentage({ tiltPercent100thsValue }: WindowCovering.GoToTiltPercentageRequest): MaybePromise {
        this.#assertMotionLockStatus();

        if (this.features.positionAwareTilt) {
            this.state.targetPositionTiltPercent100ths = tiltPercent100thsValue ?? null;
            this.#triggerTiltMotion(
                MovementDirection.DefinedByPosition,
                this.state.targetPositionTiltPercent100ths ?? undefined,
            );
        } else {
            if (tiltPercent100thsValue === 0) {
                this.upOrOpen();
            } else {
                this.downOrClose();
            }
        }
    }
}

export namespace WindowCoveringBaseServer {
    export class Internal {
        /** Does the device supports calibration? */
        supportsCalibration: boolean = false;

        /** Status of the Device Calibration mode. */
        calibrationMode: CalibrationMode = CalibrationMode.Disabled;

        /** Status of the Device Maintenance mode. */
        inMaintenanceMode: boolean = false;

        /**
         * Disable OperationalMode and position value management.
         * This requires the device developer to set all these states (operationalMode, percentage and
         * absolute values according to the feature set) according to the Matter specification!
         */
        disableOperationalModeHandling: boolean = false;
    }

    export class State extends WindowCoveringBase.State {
        /** Does the device supports maintenance mode? */
        supportsMaintenanceMode: boolean = true;
    }

    export declare const ExtensionInterface: {
        handleMovement(
            type: MovementType,
            reversed: boolean,
            direction: MovementDirection,
            targetPercent100ths?: number,
        ): MaybePromise;
        handleStopMovement(): MaybePromise;
        executeCalibration(): MaybePromise;
    };
}

export class WindowCoveringServer extends WindowCoveringBaseServer.for(ClusterType(WindowCovering.Base)) {}
