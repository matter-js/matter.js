/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotADirectoryError } from "#errors.js";
import { Command } from "./command.js";

Command({
    usage: "[PATH]",
    description: "Change current working directory.  If you omit PATH changes to the last node entered.",
    maxArgs: 1,
    positionalArgs: [{ name: "path", description: "directory to enter", type: "string" }],

    invoke: async function cd({ path }) {
        if (path === undefined) {
            path = this.env.vars.get("home", "/");
        } else {
            path = `${path}`;
        }

        const location = await this.location.at(`${path}`);

        if (location.kind !== "directory") {
            throw new NotADirectoryError(path);
        }

        this.location = location;

        await this.env.vars.persist("cwd", location.path);
    },
});
