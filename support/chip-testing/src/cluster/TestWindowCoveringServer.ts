/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Logger, Millis, Seconds, Time, Timer } from "@matter/main";
import { MovementDirection, MovementType, WindowCoveringServer } from "@matter/main/behaviors/window-covering";
import { WindowCovering } from "@matter/main/clusters/window-covering";

const logger = Logger.get("TestWindowCoveringServer");

const TestWindowCoveringServerBase = WindowCoveringServer.with(
    WindowCovering.Feature.Lift,
    WindowCovering.Feature.Tilt,
    WindowCovering.Feature.PositionAwareLift,
    WindowCovering.Feature.PositionAwareTilt,
    WindowCovering.Feature.AbsolutePosition,
);

type MoveData = {
    timer: Timer;
    increment: number;
    targetPercent100ths: number;
    counter: number;
};

/**
 * Test implementation of window covering that can execute movements within 6 seconds as defined by default in the
 * chip yaml tests. We use a step timer approach to simulate the movement. Calibration is also supported by just
 * waiting 1s.
 */
export class TestWindowCoveringServer extends TestWindowCoveringServerBase {
    declare protected internal: TestWindowCoveringServer.Internal;

    override initialize() {
        logger.info("TestWindowCoveringServer initialized");
        return super.initialize();
    }

    override async handleMovement(
        type: MovementType,
        _reversed: boolean,
        direction: MovementDirection,
        targetPercent100ths?: number,
    ) {
        if (targetPercent100ths === undefined) {
            if (direction === MovementDirection.Open) {
                targetPercent100ths = 0;
            } else {
                targetPercent100ths = 10000;
            }
        }

        const typeName = type === MovementType.Lift ? "lift" : "tilt";
        const currentValue =
            type === MovementType.Lift
                ? this.state.currentPositionLiftPercent100ths
                : this.state.currentPositionTiltPercent100ths;
        if (currentValue === null) {
            logger.error("Current position is not set");
            return;
        }
        const increment =
            targetPercent100ths < currentValue
                ? Math.ceil((targetPercent100ths - currentValue) / 6)
                : Math.floor((targetPercent100ths - currentValue) / 6);

        if (increment === 0) {
            return;
        }

        logger.info(
            `Initiating movement timer from ${currentValue} to ${targetPercent100ths} with increment ${increment} for ${typeName}...`,
        );
        this.internal.moveData[typeName]?.timer.stop();
        this.internal.moveData[typeName] = {
            targetPercent100ths,
            increment,
            counter: 0,
            timer: Time.getPeriodicTimer(
                typeName,
                Millis(950),
                MovementType.Lift === type
                    ? this.callback(this.#handleLiftMovementTick, { lock: true })
                    : this.callback(this.#handleTiltMovementTick, { lock: true }),
            ),
        };
        this.internal.moveData[typeName]?.timer.start();
    }

    #handleTiltMovementTick() {
        this.#handleMovementTick(MovementType.Tilt);
    }

    #handleLiftMovementTick() {
        this.#handleMovementTick(MovementType.Lift);
    }

    #handleMovementTick(type: MovementType) {
        const moveData = this.internal.moveData[type === MovementType.Lift ? "lift" : "tilt"];
        if (!moveData) {
            return;
        }
        moveData.counter++;
        if (moveData.counter >= 6) {
            moveData.timer.stop();
            if (type === MovementType.Lift) {
                if (this.state.currentPositionLiftPercent100ths === null) {
                    logger.error("Current lift position is not set. Should never happen.");
                    return;
                }
                this.state.currentPositionLiftPercent100ths = moveData.targetPercent100ths;
            } else {
                if (this.state.currentPositionTiltPercent100ths === null) {
                    logger.error("Current tilt position is not set. SHould never happen.");
                    return;
                }
                this.state.currentPositionTiltPercent100ths = moveData.targetPercent100ths;
            }
            this.internal.moveData[type === MovementType.Lift ? "lift" : "tilt"] = undefined;
        } else {
            if (type === MovementType.Lift) {
                if (this.state.currentPositionLiftPercent100ths === null) {
                    logger.error("Current lift position is not set. SHould never happen.");
                    return;
                }
                this.state.currentPositionLiftPercent100ths += moveData.increment;
            } else {
                if (this.state.currentPositionTiltPercent100ths === null) {
                    logger.error("Current tilt position is not set. Should never happen.");
                    return;
                }
                this.state.currentPositionTiltPercent100ths += moveData.increment;
            }
        }
    }

    override handleStopMovement() {
        this.internal.moveData.lift?.timer.stop();
        this.internal.moveData.tilt?.timer.stop();
        return super.handleStopMovement();
    }

    override async executeCalibration() {
        logger.info("Calibration executed");
        return Time.sleep("calibration", Seconds.one);
    }

    override async [Symbol.asyncDispose]() {
        this.internal.moveData.lift?.timer.stop();
        this.internal.moveData.tilt?.timer.stop();
        return super[Symbol.asyncDispose]?.();
    }
}

export namespace TestWindowCoveringServer {
    export class Internal extends TestWindowCoveringServerBase.Internal {
        moveData: {
            lift?: MoveData;
            tilt?: MoveData;
        } = {};
    }
}
