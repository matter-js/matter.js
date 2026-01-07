/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise, Observable } from "#general";
import { LowPowerBehavior } from "./LowPowerBehavior.js";

/**
 * This is the default server implementation of {@link LowPowerBehavior}.
 */
export class LowPowerServer extends LowPowerBehavior {
    declare events: LowPowerServer.Events;

    override sleep(): MaybePromise {
        this.events.enterLowPowerMode.emit();
    }
}

export namespace LowPowerServer {
    export class Events extends LowPowerBehavior.Events {
        enterLowPowerMode = Observable();
    }
}
