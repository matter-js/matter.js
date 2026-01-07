/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "./command.js";

Command({
    description: "Display current working directory.",
    maxArgs: 0,

    invoke: function pwd() {
        this.out(this.location.path, "\n");
    },
});
