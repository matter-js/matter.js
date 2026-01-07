/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VariableService } from "#general";
import { Command } from "./command.js";

Command({
    usage: ["", "KEY=VALUE", "KEY VALUE"],
    description:
        'Set or display environment variables.  matter.js defines variables in a hierarchy with "." as a delimiter.  Variables persist across restarts.',
    maxArgs: 2,
    restArgs: { name: "KV", description: "key and/or value", type: "string" },

    invoke: async function set(args) {
        switch (args._.length) {
            case 0:
                return this.env.vars.vars;

            case 1:
                const assignment = `${args._[0]}`;
                const equalPos = assignment.indexOf("=");
                if (equalPos === -1) {
                    this.err("Invalid argument: parameter must be of the form key=value");
                }
                await this.env.vars.persist(assignment.slice(0, equalPos), assignment.slice(equalPos + 1));
                break;

            case 2:
                await this.env.vars.persist(`${args._[0]}`, args._[1] as VariableService.Value);
                break;
        }
    },
});
