/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FanControl } from "#clusters/fan-control";
import { FanControlBehavior } from "./FanControlBehavior.js";

/**
 * This is the default server implementation of {@link FanControlBehavior}.
 */
export class FanControlServer extends FanControlBehavior {
    override initialize() {
        if (this.state.fanMode === undefined) {
            this.state.fanMode = FanControl.FanMode.Off;
        }
    }
}
