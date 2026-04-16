/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import type { ServerNode } from "#node/ServerNode.js";

class InstalledBehavior extends Behavior {
    static override readonly id = "installed-via-plugin";
}

/**
 * Test plugin: named `install` export takes priority over other exports.
 */
export function install(node: ServerNode) {
    node.behaviors.require(InstalledBehavior);
}
