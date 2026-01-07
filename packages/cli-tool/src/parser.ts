/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLineInfo, Options, parse, parseExpressionAt } from "acorn";
import { generate } from "escodegen";

/**
 * The result of parsing our command dialect.
 *
 * We support an expanded JS dialect that allows function invocation with the syntax "command [...text|expr]*".  This
 * allows us to support both JS less verbose "shell command" syntax that nonetheless supports full JS semantics.
 *
 * Differentiating between "shell commands" and JS is a bit fiddly but from a high level:
 *
 *   - If it starts with a keyword that starts a JS statement or assignment then it is a statement
 *   - If it starts with a path (e.g. "foo", "foo/bar", "./foo/bar", etc.) it is a command
 *   - Otherwise it is a JS statement
 */
export type Input = EmptyInput | CommandInput | StatementInput | IncompleteInput;

export interface EmptyInput {
    kind: "empty";
}

export interface CommandArg {
    line: number;
    column: number;
    js: string;
}

export interface CommandInput {
    kind: "command";
    name: string;
    args: CommandArg[];
}

export interface StatementInput {
    kind: "statement";
    js: string;
}

export interface IncompleteInput {
    kind: "incomplete";
    error: SyntaxError;
}

const ACORN_PARSE_OPTIONS: Options = {
    ecmaVersion: "latest",
    allowAwaitOutsideFunction: true,
};

/**
 * Translate user input into a {@link Input}.
 */
export function parseInput(input: string): Input {
    const inputIsCommand = isCommand(input);
    try {
        if (inputIsCommand) {
            return parseCommand(input);
        }

        // Only parse so we can detect incomplete statements; otherwise let node do the work
        parse(input, ACORN_PARSE_OPTIONS);
        return { kind: "statement", js: input };
    } catch (e) {
        if (errorIndicatesIncomplete(e, input)) {
            return { kind: "incomplete", error: e };
        }
        if (!inputIsCommand) {
            // Let node throw its own error
            return { kind: "statement", js: input };
        }
        throw e;
    }
}

function errorIndicatesIncomplete(e: any, input: string): e is SyntaxError {
    if (e instanceof SyntaxError) {
        if (e.message.startsWith("Unexpected token") && (e as unknown as { pos: number }).pos === input.length) {
            return true;
        }
        if (e.message.match(/^Unterminated (?:template literal|group|comment|regular expression|template)/)) {
            return true;
        }
    }
    return false;
}

function parseCommand(command: string): Input {
    // Find beginning of name
    let start = 0;
    while (start < command.length && command[start].match(/\s/)) {
        start++;
    }

    if (start === command.length) {
        return { kind: "empty" };
    }

    // Find end of name.  We identified command with regexp so this can be simplistic
    const nameStart = start;
    while (start < command.length && !command[start].match(/\s/)) {
        start++;
    }

    // We now know the command name
    const name = command.slice(nameStart, start);

    // Extract arguments.  These are either unadorned text or a JS expression
    const args = Array<CommandArg>();
    while (command.trim().length) {
        while (start < command.length && command[start].match(/^\s/)) {
            start++;
        }

        if (start === command.length) {
            break;
        }

        let isExpression;
        switch (command[start]) {
            case "(":
            case "[":
            case "{":
            case '"':
            case "`":
            case "'":
                isExpression = true;
                break;

            default:
                isExpression = false;
                break;
        }

        const { line, column } = getLineInfo(command, start);

        if (isExpression) {
            try {
                const ast = parseExpressionAt(command, start, ACORN_PARSE_OPTIONS);
                args.push({ js: generate(ast), line, column });
                start = ast.end;
            } catch (e) {
                // acorn sticks error onto end of message; move it into the stack like Node would
                if (e instanceof SyntaxError) {
                    let message = e.message;
                    const match = message.match(/(.*) \(\d+:\d+\)$/);
                    let location;
                    if (match) {
                        message = match[1];
                        location = message[2];
                    } else {
                        const loc = getLineInfo(command, start);
                        location = `${loc.line}:${loc.column}`;
                    }
                    const error = new SyntaxError(message);
                    error.stack = `SyntaxError: ${message}\n    at matter-cli-input:${location}`;
                    throw error;
                }
            }
        } else {
            let end = start;

            while (end < command.length) {
                if (command[end].match(/\s/)) {
                    break;
                }
                end++;
            }

            const str = command.slice(start, end);
            start = end;

            let js;
            if (str === "true" || str === "false" || str === "NaN" || str === "Infinity" || isNumeric(str)) {
                js = str;
            } else {
                js = JSON.stringify(str);
            }

            args.push({ js, line, column });
        }
    }

    return { kind: "command", name, args };
}

export function isCommand(input: string) {
    if (input.match(isCommand.STATEMENT_DETECTOR)) {
        return false;
    }

    if (input.match(isCommand.COMMAND_DETECTOR)) {
        return true;
    }

    return false;
}

export namespace isCommand {
    const STATEMENT_KEYWORDS = [
        "async",
        "break",
        "class",
        "const",
        "debugger",
        "delete",
        "do",
        "for",
        "function",
        "if",
        "new",
        "return",
        "switch",
        "throw",
        "try",
        "let",
        "while",
        "with",
        "export",
        "import",
        "var",
        "void",
        "true",
        "false",
        "this",
        "typeof",
        "await",
    ];

    const IDENTIFIER = "[\\p{L}$_][\\p{L}$_0-9]*";
    const PATH_SEGMENT = "[\\p{L}$_][\\p{L}$_\\-0-9]*";
    const EOW = "(?:\\s|$)";

    const statementStarts = [...STATEMENT_KEYWORDS.map(kw => `${kw}${EOW}`), `${IDENTIFIER}\\s*=`];

    const commandStarts = ["\\.", "\\.\\.", `\\s*(?:\\.{0,2}/)?${PATH_SEGMENT}(?:\\/(?:\\.?\\.|${PATH_SEGMENT}))*`];

    // If this regexp matches, input is NOT a command
    export const STATEMENT_DETECTOR = new RegExp(`^\\s*(?:${statementStarts.join("|")})`, "u");

    // If above regexp does not match but this one does then input IS a command
    export const COMMAND_DETECTOR = new RegExp(`^(?:${commandStarts.join("|")})${EOW}`, "u");
}

/**
 * {@see https://stackoverflow.com/questions/175739/how-can-i-check-if-a-string-is-a-valid-number}
 */
function isNumeric(str: string) {
    return (
        !isNaN(str as unknown as number) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str))
    ); // ...and ensure strings of whitespace fail
}
