/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";

/**
 * Test plugin: multiple *Server exports — all should be installed.
 */
export class AmbiguousAServer extends Behavior {
    static override readonly id = "ambiguous-a";
}

export class AmbiguousBServer extends Behavior {
    static override readonly id = "ambiguous-b";
}
