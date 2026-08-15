/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "@matter/general";
import { Behavior } from "../../Behavior.js";
import type { NetworkRuntime } from "./NetworkRuntime.js";

/**
 * NetworkingBehavior is the component of Matter.js that handles online connectivity for a Matter node.
 *
 * NetworkingBehavior does not have an associated Matter cluster.  It is exclusive to Matter.js.
 */
export class NetworkBehavior extends Behavior {
    static override readonly id = "network";

    static override readonly early = true;

    declare internal: NetworkBehavior.Internal;
    declare readonly state: NetworkBehavior.State;

    override [Symbol.asyncDispose]() {
        return this.internal.runtime?.close();
    }

    /**
     * Invoked by node when networking is ready.
     */
    startup(): MaybePromise {}
}

export namespace NetworkBehavior {
    export class Internal {
        runtime?: NetworkRuntime;
    }

    export class State {
        /**
         * The operational port the node binds.  When unset the node binds the standard Matter port (5540) if it is
         * commissionable, or an ephemeral port if commissioning is disabled (e.g. a controller).
         */
        port?: number = undefined;
        operationalPort = -1;
    }
}
