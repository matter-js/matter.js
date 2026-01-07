/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Domain, DomainContext } from "#domain.js";
import { Environment, LogFormat, MatterError } from "#general";
import { CommandInput } from "#parser.js";
import { repl } from "#repl.js";
import "@matter/nodejs";
import colors from "ansi-colors";
import { stdout } from "node:process";

export async function main(argv: string[]) {
    colors.enabled = stdout.isTTY;

    let args = argv.slice(2);
    if (!args.length) {
        await repl();
        return;
    }

    for (const arg of args) {
        if (arg.startsWith("-")) {
            if (arg === "--help") {
                args = ["help"];
            } else {
                throw new MatterError(`Unknown command line argument ${arg}`);
            }
        } else {
            // Identified command
            break;
        }
    }

    const command: CommandInput = {
        kind: "command",
        name: args[0],
        args: args.slice(1).map(arg => {
            let js;
            if (arg.startsWith("(")) {
                js = arg;
            } else {
                js = JSON.stringify(arg);
            }
            return {
                line: 0,
                column: 0,
                js,
            };
        }),
    };

    const cx: DomainContext = {
        description: "matter.js",
        env: Environment.default,

        out(...text) {
            stdout.write(text.join(""));
        },

        err(...text) {
            let str = text.join("");
            if (str.indexOf("\x1b") === -1) {
                str = colors.red(str);
            }
            stdout.write(str);
        },

        get terminalWidth() {
            return process.stdout.columns;
        },

        colorize: true,
    };

    const domain = await Domain(cx);
    try {
        const result = await domain.execute(command);
        if (result !== undefined) {
            domain.out(domain.inspect(result), "\n");
        }
    } catch (e) {
        domain.err(LogFormat.formats.ansi(e), "\n");
        process.exitCode = 1;
    }
}
