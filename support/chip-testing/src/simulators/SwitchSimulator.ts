/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Logger, Millis, Time, Timer } from "@matter/general";
import { Endpoint } from "@matter/main";
import { SwitchServer } from "@matter/main/behaviors/switch";
import { BackchannelCommand } from "@matter/testing";

const logger = Logger.get("SwitchSimulator");

const NEUTRAL_SWITCH_POSITION = 0;

export class SwitchSimulator {
    #switchActions = new Array<{ position: number; delay?: Duration }>();
    #endpoint: Endpoint;
    #executionDelayTimer?: Timer;

    constructor(endpoint: Endpoint) {
        this.#endpoint = endpoint;
    }

    executeActions(actions: { position: number; delay?: Duration }[]) {
        if (this.#switchActions.length !== 0 || this.#executionDelayTimer !== undefined) {
            throw new Error("Still unprocessed actions existing ... Invalid state!");
        }
        logger.debug("Switch action step", actions, ". Existing actions:", this.#switchActions);
        this.#switchActions = actions;
        this.#processNextAction();
    }

    #processNextAction() {
        if (this.#switchActions.length === 0) {
            this.#executionDelayTimer = undefined;
            return;
        }

        const action = this.#switchActions.shift();
        if (action) {
            this.#endpoint
                .setStateOf(SwitchServer, {
                    currentPosition: action.position,
                })
                .then(
                    () => {
                        this.#executionDelayTimer = undefined;
                        logger.debug(
                            "Switch action to position ",
                            action.position,
                            ", next action in",
                            action.delay,
                            "ms",
                        );
                        if (action.delay !== undefined && action.delay > 0) {
                            this.#executionDelayTimer = Time.getTimer("Switch action step", action.delay, () =>
                                this.#processNextAction(),
                            ).start();
                        }
                    },
                    error => console.error("Error setting switch state:", error),
                );
        }
    }

    /**
     * Named pipe handler for simulated long press on an action switch.
     *
     * Usage example:
     *   echo '{"Name": "SimulateLongPress", "EndpointId": 3, "ButtonId": 1, "LongPressDelayMillis": 800,
     * "LongPressDurationMillis": 1000}' > /tmp/chip_all_clusters_fifo_1146610
     *
     * JSON Arguments:
     *   - "Name": Must be "SimulateLongPress"
     *   - "EndpointId": number of endpoint having a switch cluster
     *   - "ButtonId": switch position in the switch cluster for "down" button (not idle)
     *   - "LongPressDelayMillis": Time in milliseconds before the LongPress
     *   - "LongPressDurationMillis": Total duration in milliseconds from start of the press to LongRelease
     */
    static async simulateLongPress(endpoint: Endpoint, command: BackchannelCommand.SimulateLongPress) {
        const simulator = new SwitchSimulator(endpoint);

        // Configure cluster according to tests
        await endpoint.setStateOf(SwitchServer, { longPressDelay: Millis(command.longPressDelayMillis) });

        // Execute tests
        simulator.executeActions([
            { position: command.buttonId, delay: Millis(command.longPressDurationMillis) }, // LongPressDelayMillis is ignored because just used to send the LogPress event?
            { position: NEUTRAL_SWITCH_POSITION },
        ]);
    }

    /**
     * Named pipe handler for simulated multi-press on an action switch.
     *
     * Usage example:
     *   echo '{"Name": "SimulateMultiPress", "EndpointId": 3, "ButtonId": 1, "MultiPressPressedTimeMillis": 100,
     * "MultiPressReleasedTimeMillis": 350, "MultiPressNumPresses": 2}' > /tmp/chip_all_clusters_fifo_1146610
     *
     * JSON Arguments:
     *   - "Name": Must be "SimulateMultiPress"
     *   - "EndpointId": number of endpoint having a switch cluster
     *   - "ButtonId": switch position in the switch cluster for "down" button (not idle)
     *   - "MultiPressPressedTimeMillis": Pressed time in milliseconds for each press
     *   - "MultiPressReleasedTimeMillis": Released time in milliseconds after each press
     *   - "MultiPressNumPresses": Number of presses to simulate
     *   - "FeatureMap":  The feature map to simulate
     *   - "MultiPressMax": max number of presses (from attribute).
     */
    static async simulateMultiPress(endpoint: Endpoint, command: BackchannelCommand.SimulateMultiPress) {
        const simulator = new SwitchSimulator(endpoint);

        // Configure cluster according to tests
        await endpoint.setStateOf(SwitchServer, {
            multiPressDelay: Millis(command.multiPressReleasedTimeMillis + 500),
        });

        // Collect test steps
        const actions: { position: number; delay?: Duration }[] = [];

        for (let i = 0; i < command.multiPressNumPresses; i++) {
            actions.push({
                position: command.buttonId,
                delay: Millis(command.multiPressPressedTimeMillis),
            });
            if (i < command.multiPressNumPresses - 1) {
                actions.push({
                    position: NEUTRAL_SWITCH_POSITION,
                    delay: Millis(command.multiPressReleasedTimeMillis),
                });
            }
        }

        actions.push({ position: NEUTRAL_SWITCH_POSITION });

        // Execute test
        simulator.executeActions(actions);
    }
}
