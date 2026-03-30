/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status, StatusResponseError } from "@matter/types";
import { Label } from "@matter/types/clusters/label";
import { UserLabelBehavior } from "./UserLabelBehavior.js";

/**
 * This is the default server implementation of {@link UserLabelBehavior}.
 *
 * Spec requires the server to support at least 4 label entries, we allow up to 255 by default.
 * Configure {@link UserLabelServer.State.maxLabels} to change the limit.
 */
export class UserLabelServer extends UserLabelBehavior {
    declare state: UserLabelServer.State;

    override initialize() {
        this.reactTo(this.events.labelList$Changing, this.#validateLabelListLength);
    }

    #validateLabelListLength(value: Label.LabelStruct[]) {
        if (value.length > this.state.maxLabels) {
            throw new StatusResponseError(
                `LabelList length ${value.length} exceeds supported maximum of ${this.state.maxLabels}`,
                Status.ResourceExhausted,
            );
        }
    }
}

export namespace UserLabelServer {
    export class State extends UserLabelBehavior.State {
        /**
         * Maximum number of label entries supported. Spec requires at least 4.
         */
        maxLabels = 255;
    }
}
