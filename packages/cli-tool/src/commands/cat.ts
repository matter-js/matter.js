/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "./command.js";

Command({
    usage: "[PATH]...",
    description: "Inspect values in one or more paths.",
    aliases: ["inspect"],

    invoke: async function cat(args) {
        const locations = await Promise.all(args._.map(path => this.location.at(`${path}`)));
        for (const location of locations) {
            this.out(this.inspect(location.definition), "\n");
        }
    },
});
