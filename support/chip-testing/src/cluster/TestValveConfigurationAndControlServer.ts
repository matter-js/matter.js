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
 * {@link MOVEMENT_TIME} later in a separate transaction, so subscribers see each step.  RemainingDuration counts down
 * once per second and the valve closes when it reaches 0.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 4.6.8
 */
export class TestValveConfigurationAndControlServer extends ValveConfigurationAndControlServer.with("Level") {
    declare protected internal: TestValveConfigurationAndControlServer.Internal;

    override initialize() {
        this.internal.movement = this.reactorTimer("valve movement", MOVEMENT_TIME, this.#completeMovement);
        this.internal.countdown = this.periodicReactorTimer("valve countdown", Seconds(1), this.#countDown);

        // RemainingDuration has quality Q: the regular countdown by one second is not reported
        this.events.remainingDuration$Changed.quiet.shouldEmit = (newValue, oldValue) =>
            oldValue === null || newValue === null || newValue !== oldValue - 1 ? "now" : false;
    }

    override open({ openDuration, targetLevel }: ValveConfigurationAndControl.OpenRequest) {
        const duration = openDuration === undefined ? this.state.defaultOpenDuration : openDuration;

        this.state.targetState = ValveState.Open;
        this.state.currentState = ValveState.Transitioning;
        this.state.openDuration = duration;
        this.state.remainingDuration = duration;
        this.state.targetLevel = targetLevel ?? FULLY_OPEN;

        this.internal.movement?.start();
        if (duration === null) {
            this.internal.countdown?.stop();
        } else {
            this.internal.countdown?.start();
        }
    }

    override close() {
        this.#close();
    }

    #close() {
        this.internal.countdown?.stop();

        this.state.openDuration = null;
        this.state.remainingDuration = null;
        this.state.targetState = ValveState.Closed;
        this.state.currentState = ValveState.Transitioning;
        this.state.targetLevel = 0;

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
    }

    #countDown() {
        const remaining = this.state.remainingDuration;
        if (remaining === null) {
            this.internal.countdown?.stop();
            return;
        }
        if (remaining <= 1) {
            this.#close();
            return;
        }
        this.state.remainingDuration = remaining - 1;
    }
}

export namespace TestValveConfigurationAndControlServer {
    export class Internal {
        movement?: Timer;
        countdown?: Timer;
    }
}
