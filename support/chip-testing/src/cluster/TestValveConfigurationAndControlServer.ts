/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Millis, Seconds, Timer } from "@matter/general";
import { ValveConfigurationAndControlServer } from "@matter/main/behaviors/valve-configuration-and-control";
import { ValveConfigurationAndControl } from "@matter/main/clusters/valve-configuration-and-control";

const { ValveState } = ValveConfigurationAndControl;

const MOVEMENT_TIME = Millis(100);

const FULLY_OPEN = 100;

/**
 * Simulated valve with the Level feature.
 *
 * Open and Close set the target attributes and CurrentState Transitioning; the valve reaches the target level
 * {@link MOVEMENT_TIME} later in a separate transaction, so subscribers see each step.  A command that leaves the valve
 * where it is completes at once, as CHIP's all-devices-app does.  RemainingDuration counts down once per second; at 0
 * the valve closes and RemainingDuration becomes null once it is closed.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.6.8
 */
export class TestValveConfigurationAndControlServer extends ValveConfigurationAndControlServer.with("Level") {
    declare protected internal: TestValveConfigurationAndControlServer.Internal;

    override initialize() {
        this.internal.movement = this.reactorTimer("valve movement", MOVEMENT_TIME, this.#completeMovement, {
            lock: true,
        });
        this.internal.countdown = this.periodicReactorTimer("valve countdown", Seconds(1), this.#countDown, {
            lock: true,
        });

        // RemainingDuration has quality Q: the regular countdown by one second is not reported (§ 4.6.7.4)
        this.events.remainingDuration$Changed.quiet.shouldEmit = (newValue, oldValue) => {
            const closingTimeChanged = this.internal.closingTimeChanged;
            this.internal.closingTimeChanged = false;
            return closingTimeChanged || oldValue === null || newValue === null || newValue === 0 || newValue > oldValue
                ? "now"
                : false;
        };
    }

    override open({ openDuration, targetLevel }: ValveConfigurationAndControl.OpenRequest) {
        const duration = openDuration === undefined ? this.state.defaultOpenDuration : openDuration;

        this.state.openDuration = duration;
        this.internal.closingTimeChanged = this.state.remainingDuration !== duration;
        this.state.remainingDuration = duration;
        if (duration === null) {
            this.internal.countdown?.stop();
        } else {
            this.internal.countdown?.start();
        }

        this.#move(ValveState.Open, targetLevel ?? FULLY_OPEN);
    }

    override close() {
        this.#close(null);
    }

    #close(remainingDuration: null | 0) {
        this.internal.countdown?.stop();
        this.state.openDuration = null;
        this.state.remainingDuration = remainingDuration;
        this.#move(ValveState.Closed, 0);
    }

    #move(targetState: ValveConfigurationAndControl.ValveState, targetLevel: number) {
        this.state.targetState = targetState;
        this.state.targetLevel = targetLevel;

        if (this.state.currentState === targetState && this.state.currentLevel === targetLevel) {
            this.#completeMovement();
            return;
        }

        this.state.currentState = ValveState.Transitioning;
        this.internal.movement?.start();
    }

    #completeMovement() {
        const level = this.state.targetLevel;
        if (level === null) {
            return;
        }

        this.state.currentLevel = level;
        this.state.currentState = level === 0 ? ValveState.Closed : ValveState.Open;
        this.state.targetLevel = null;
        this.state.targetState = null;
        if (level === 0) {
            this.state.remainingDuration = null;
        }
    }

    #countDown() {
        const remaining = this.state.remainingDuration;
        if (remaining === null) {
            this.internal.countdown?.stop();
            return;
        }
        if (remaining <= 1) {
            this.#close(0);
            return;
        }
        this.state.remainingDuration = remaining - 1;
    }
}

export namespace TestValveConfigurationAndControlServer {
    export class Internal {
        movement?: Timer;
        countdown?: Timer;
        closingTimeChanged = false;
    }
}
