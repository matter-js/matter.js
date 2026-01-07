/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from "commander";
import process from "node:process";
import { ansi } from "../ansi-text/text-builder.js";

export function commander(name: string, description: string) {
    return new Command(name)
        .description(description)
        .allowExcessArguments(false)
        .configureOutput({
            writeOut: str => process.stdout.write(`\n${formatHelp(str)}\n`),
            writeErr: str => process.stderr.write(`\n${ansi.red(str)}\n`),
        });
}
function formatHelp(help: string) {
    if (!help.startsWith("Usage: ")) {
        return help;
    }

    help = help.replace(/^Usage: (\S+)/, (_match, name) => `Usage: ${ansi.bold(name)}`);
    help = help.replace(/^( {2}.+ {2})/gm, (_match, input: string) =>
        input
            .split(",")
            .map(item => item.replace(/(-*\w+)/, (_match, word) => ansi.blue(word).toString()))
            .join(","),
    );
    return help;
}
