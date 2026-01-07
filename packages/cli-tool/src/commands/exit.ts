/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "./command.js";

Command({
    description: "Quit this application.",

    invoke: function exit() {
        if (this.exitHandler === undefined) {
            this.err("Exit not suported: No exit handler");
            return;
        }

        return this.exitHandler();
    },
});
