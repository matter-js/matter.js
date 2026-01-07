/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "./command.js";

Command({
    description: "Clear the terminal screen",

    invoke: function clear() {
        console.clear();
    },
});
