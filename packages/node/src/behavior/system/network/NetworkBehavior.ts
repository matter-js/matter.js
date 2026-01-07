/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise, STANDARD_MATTER_PORT } from "#general";
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
    declare state: NetworkBehavior.State;

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
        port = STANDARD_MATTER_PORT;
        operationalPort = -1;
    }
}
