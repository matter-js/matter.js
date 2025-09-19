/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Chars } from "./chars.js";
import { Producer } from "./producer.js";
import { Style } from "./style.js";
import { Token } from "./token.js";

/**
 * Convert ANSI text into a sequence of tokens.
 */
export function* tokenize(text: string): Producer {
    for (let pos = 0; pos < text.length; ) {
        const unit = text[pos];
        switch (unit) {
            case "\n":
                yield { kind: "newline" };
                pos++;
                break;

            case "\r":
                if (text[pos + 1] === "\n") {
                    yield { kind: "newline" };
                    pos += 2;
                } else {
                    yield { kind: "carriage-return" };
                    pos += 1;
                }
                break;

            case "\t":
                yield { kind: "tab" };
                pos++;
                break;

            case "\x1b":
                let valid = false;
                let newColumn: number | undefined;
                const escapeStart = pos;
                pos++;
                switch (text[pos]) {
                    case "[":
                        // Fe CSI
                        pos++;

                        // Valid sequence members
                        while (text[pos] >= "\x30" && text[pos] <= "\x3f") {
                            pos++;
                        }

                        // Valid sequence termination
                        if (text[pos] >= "\0x40" && text[pos] <= "\x7e") {
                            const param = text.slice(escapeStart + 2, pos);

                            switch (text[pos]) {
                                case "m": // SGR (select graphics rendition), the sequence that controls styling
                                    yield {
                                        kind: "style",
                                        style: Style(param),
                                    };
                                    pos++;
                                    continue;

                                case "E": // Move up
                                case "F": // Move down
                                    newColumn = 0;
                                    break;

                                case "G": // Move to column
                                    newColumn = Number.parseInt(param);
                                    break;

                                case "H": // Move to row and column
                                    const [, column] = param.split(";");
                                    newColumn = column ? Number.parseInt(column) : 0;
                                    break;

                                case "J": // Clear screen part
                                    switch (param) {
                                        case "2": // Entire screen
                                        case "3": // Entire screen plus scrollback buffer
                                            newColumn = 0;
                                    }
                                    break;
                            }

                            pos++;
                            valid = true;
                        }
                        break;

                    case "X":
                    case "]":
                    case "^":
                    case "_":
                        // Fe sequences that take a single string argument (<ESC X>, <ESC ]>, <ESC ^>, <ESC _>
                        // terminated by "\")
                        pos++;
                        while (pos < text.length) {
                            pos++;
                            if (text[pos] === "\\") {
                                valid = true;
                                break;
                            }
                        }
                        break;

                    default:
                        const code = text[pos];
                        if (
                            (code >= "\x40" && code <= "\x57") ||
                            (code >= "\x59" && code <= "\x5a") ||
                            (code >= "\x5c" && code <= "\x5d")
                        ) {
                            // Fe sequence not covered above
                            pos++;
                            valid = true;
                        } else if (code >= "\x30" && code <= "0x3f") {
                            // Fp sequence
                            pos++;
                            valid = true;
                        } else if (code >= "\x60" && code <= "0x7e") {
                            // Fs sequence
                            pos++;
                            valid = true;
                        } else if (code >= "\x20" && code <= "0x2f") {
                            pos++;
                            const code2 = text[pos];
                            if (code2 >= "\x30" && code2 <= "0x73") {
                                pos++;
                                valid = true;
                            }
                        }
                        break;
                }

                if (valid) {
                    const token: Token = {
                        kind: "ansi",
                        sequence: text.slice(escapeStart, pos),
                    };
                    if (newColumn !== undefined && Number.isFinite(newColumn)) {
                        token.newColumn = newColumn;
                    }
                    yield token;
                }

                break;

            default:
                const start = pos;

                // Whitespace - no surrogates, zero-width space does not contribute to width
                if (Chars.breakingSpace.has(unit)) {
                    let width = 1;
                    pos++;
                    while (Chars.breakingSpace.has(text[pos])) {
                        pos++;
                        // No width for zero-width space
                        if (unit !== "\u200b") {
                            width++;
                        }
                    }
                    yield {
                        kind: "breaking",
                        str: text.slice(start, pos),
                        width,
                    };
                    break;
                }

                // Scan characters
                let width = 0;
                while (pos < text.length) {
                    let cp = text[pos];

                    // Combine proper surrogate pairs
                    if (cp >= "\ud800" && cp < "\udc00") {
                        const nextUnit = text[pos + 1];
                        if (nextUnit !== undefined && nextUnit >= "\udc00" && nextUnit < "\ue000") {
                            cp += nextUnit;
                        }
                    }

                    if (!cp.match(Chars.nonbreakingText)) {
                        break;
                    }

                    pos += cp.length;
                    if (!cp.match(Chars.zeroWidth)) {
                        width++;
                    }
                }

                // If we detected no characters, the code unit is garbage and we skip it entirely
                if (start === pos) {
                    pos++;
                    break;
                }

                // Yield the token and skip forward to the last character
                yield {
                    kind: "nonbreaking",
                    str: text.slice(start, pos),
                    width,
                };
        }
    }
}
