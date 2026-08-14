/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DishwasherModeServer } from "@matter/main/behaviors/dishwasher-mode";
import { ModeBase } from "@matter/main/clusters/mode-base";

/**
 * Dishwasher mode that can be put into a state where every mode transition fails, driven by the `ModeChange` /
 * `ToggleFailTransition` backchannel command.
 */
export class TestDishwasherModeServer extends DishwasherModeServer {
    declare state: TestDishwasherModeServer.State;

    override changeToMode(request: ModeBase.ChangeToModeRequest) {
        if (this.state.failTransition) {
            return {
                status: ModeBase.ModeChangeStatus.InvalidInMode,
                statusText: "Mode change not allowed due to device state",
            };
        }
        return super.changeToMode(request);
    }
}

export namespace TestDishwasherModeServer {
    export class State extends DishwasherModeServer.State {
        failTransition: boolean = false;
    }
}
