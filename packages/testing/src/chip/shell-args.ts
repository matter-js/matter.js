/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Thrown when an argument string ends inside a quoted section.
 */
export class UnterminatedQuoteError extends Error {}

/**
 * Split an argument string the way a POSIX shell does: whitespace separates arguments, single quotes keep their content
 * literally, double quotes keep their content except for `\"` and `\\`, and a backslash outside quotes escapes the next
 * character.
 *
 * CHIP's test metadata writes app and script arguments for a shell, e.g. `--device "*"`, so the quotes are not part of
 * the value.
 */
export function splitShellArgs(raw: string): string[] {
    const args = new Array<string>();
    let current = "";
    let inArg = false;

    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];

        if (c === "'") {
            const end = raw.indexOf("'", i + 1);
            if (end === -1) {
                throw new UnterminatedQuoteError(`Unterminated single quote in arguments: ${raw}`);
            }
            current += raw.slice(i + 1, end);
            inArg = true;
            i = end;
            continue;
        }

        if (c === '"') {
            let j = i + 1;
            for (; j < raw.length && raw[j] !== '"'; j++) {
                if (raw[j] === "\\" && (raw[j + 1] === '"' || raw[j + 1] === "\\")) {
                    j++;
                }
                current += raw[j];
            }
            if (j >= raw.length) {
                throw new UnterminatedQuoteError(`Unterminated double quote in arguments: ${raw}`);
            }
            inArg = true;
            i = j;
            continue;
        }

        if (c === "\\" && i + 1 < raw.length) {
            current += raw[++i];
            inArg = true;
            continue;
        }

        if (/\s/.test(c)) {
            if (inArg) {
                args.push(current);
                current = "";
                inArg = false;
            }
            continue;
        }

        current += c;
        inArg = true;
    }

    if (inArg) {
        args.push(current);
    }
    return args;
}
