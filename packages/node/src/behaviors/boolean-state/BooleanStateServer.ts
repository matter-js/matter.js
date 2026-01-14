/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "#general";
import { BooleanStateBehavior } from "./BooleanStateBehavior.js";

/**
 * This is the default server implementation of {@link BooleanStateBehavior}.
 * If the `StateChanged` event is enabled it is emitted automatically on state change.
 */
export class BooleanStateServer extends BooleanStateBehavior {
    override initialize(): MaybePromise {
        this.reactTo(this.events.stateValue$Changed, this.#emitStateChange);
    }

    #emitStateChange(stateValue: boolean) {
        this.events.stateChange?.emit({ stateValue }, this.context);
    }
}
