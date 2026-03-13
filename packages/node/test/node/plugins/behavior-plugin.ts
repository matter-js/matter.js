/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";

/**
 * Test plugin: *Server export triggers behavior shortcut.
 */
export class TestPluginServer extends Behavior {
    static override readonly id = "test-plugin";
}
