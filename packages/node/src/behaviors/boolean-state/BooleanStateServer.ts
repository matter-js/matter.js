/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { BooleanState } from "@matter/types/clusters/boolean-state";
import { BooleanStateBehavior } from "./BooleanStateBehavior.js";

// Enable the ChangeEvent feature by default so the StateChange event is available and emitted as it was prior to 1.6,
// where the event became gated behind this feature.
const Base = BooleanStateBehavior.with(BooleanState.Feature.ChangeEvent);

/**
 * This is the default server implementation of {@link BooleanStateBehavior}.
 * If the `StateChange` event is enabled it is emitted automatically on state change.
 */
export class BooleanStateServer extends Base {
    override initialize(): MaybePromise {
        if (this.features.changeEvent) {
            this.reactTo(this.events.stateValue$Changed, this.#emitStateChange);
        }
    }

    #emitStateChange(stateValue: boolean) {
        this.events.stateChange?.emit({ stateValue }, this.context);
    }
}
