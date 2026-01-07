/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormattedText } from "#general";
import { bin, DomainCommand } from "#globals.js";
import { parse } from "acorn";
import colors from "ansi-colors";
import { generate } from "escodegen";
import { Command } from "./command.js";

Command({
    usage: "[PATH]",
    description: "Display help",
    maxArgs: 1,

    invoke: async function help({ path }) {
        const quote = (text: string) => {
            if (this.colorize) {
                return colors.blue(text);
            }
            return `"${text}"`;
        };

        if (path === undefined) {
            const HELP = `This tool allows you to interact with matter.js and your local Matter environment.
This tool understands both JavaScript and a shell-like syntax that maps "commands" to functions.  Use ${quote("ls /bin")} to see commands you can always use.  Use ${quote("help <name>")} for help with a specific command.
The current path appears in the prompt.  This points to the object this tool uses to find commands.  It is also the "global" object for any JavaScript statements you enter.
You can change the current path using ${quote("cd <path>")}.  Paths work like you would expect, including ${quote("/")}, ${quote(".")} and ${quote("..")}.\n`;

            this.out(
                "\nWelcome to ",
                this.description,
                ".\n\n",
                FormattedText(HELP, this.terminalWidth).join("\n"),
                "\n\n",
            );
            return;
        }

        const pathStr = `${path}`;
        const what = await this.searchPathFor(pathStr);

        if (what.kind !== "command") {
            this.out(`${path} is a ${what} but we can't tell you much more about it.\n\n`);
            return;
        }

        const help = (what.definition as DomainCommand).help;
        if (help) {
            help(this);
            return;
        }

        let ast;
        try {
            ast = parse(`${what.definition}`, { ecmaVersion: "latest", checkPrivateFields: false }).body[0];
        } catch (e) {
            if (!(e instanceof SyntaxError)) {
                throw e;
            }
            try {
                ast = parse(`function ${what.definition}`, { ecmaVersion: "latest", checkPrivateFields: false })
                    .body[0];
            } catch (e) {
                if (!(e instanceof SyntaxError)) {
                    throw e;
                }
            }
        }

        if (ast?.type !== "FunctionDeclaration") {
            this.out(`\nWell, ${colors.blue(pathStr)} is a function but we can't seem to parse it.\n\n`);
            return;
        }

        const usage = [colors.blue(pathStr)];
        for (const param of ast.params) {
            usage.push(`[${generate(param)}]`);
        }

        this.out(
            `\nUsage: ${usage.join(" ")}\n\n${colors.blue(pathStr)} is a function that does not provide additional usage details.\n\n`,
        );
    },
});

bin.man = bin.help;
