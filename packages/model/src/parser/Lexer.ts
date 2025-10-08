/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "../common/index.js";
import { BasicToken, Token } from "./Token.js";

function isNameChar(c: string) {
    return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "_";
}

/**
 * DSL lexer.
 *
 * Tokenizes simple text dialects.  Currently sufficient for Matter conformance and constraint tokenization.
 */
export class Lexer<T extends BasicToken<KW>, const KW extends readonly string[] = []> {
    #keywords: Set<string>;

    constructor(keywords?: KW) {
        if (keywords instanceof Set) {
            this.#keywords = keywords;
        } else {
            this.#keywords = new Set(keywords);
        }
    }

    lex(text: string, error: (code: string, message: string) => void) {
        return lex(text, error, this.#keywords) as Iterator<T>;
    }
}

export namespace Lexer {
    export const Basic = new Lexer();
}

function* lex(
    text: string,
    error: (code: string, message: string) => void,
    keywords: Set<string>,
): Generator<Token, undefined> {
    const i = text[Symbol.iterator]();

    let current = i.next();
    if (current.done) {
        return;
    }
    let peeked = i.next();

    let line = 1;
    let char = 1;

    let startLine = -1;
    let startChar = -1;

    function markStart() {
        startLine = line;
        startChar = char;
    }

    function next() {
        current = peeked;
        if (!current.done) {
            char++;
            peeked = i.next();
        }
    }

    function tokenizeName(): Token | BasicToken.Word {
        const chars = [current.value];
        while (peeked.value !== undefined && isNameChar(peeked.value)) {
            next();
            chars.push(current.value);
        }
        const name = chars.join("");

        if (keywords.has(name)) {
            return { type: name, startLine, startChar };
        }

        return { type: "word", value: name, startLine, startChar };
    }

    function binaryValueOf(digit: string | undefined) {
        if (digit === "0") {
            return 0;
        }
        if (digit === "1") {
            return 1;
        }
    }

    function decimalValueOf(digit: string | undefined) {
        if (digit === undefined) {
            return;
        }
        if (digit >= "0" && digit <= "9") {
            return digit.charCodeAt(0) - "0".charCodeAt(0);
        }
    }

    function hexadecimalValueOf(digit: string | undefined) {
        if (digit === undefined) {
            return;
        }
        if (digit >= "0" && digit <= "9") {
            return digit.charCodeAt(0) - "0".charCodeAt(0);
        }
        if (digit >= "a" && digit <= "f") {
            return 10 + digit.charCodeAt(0) - "a".charCodeAt(0);
        }
        if (digit >= "A" && digit <= "F") {
            return 10 + digit.charCodeAt(0) - "A".charCodeAt(0);
        }
        return;
    }

    function tokenizeDigits(base: number, valueOf: (digit: string[1] | undefined) => number | undefined): BasicToken {
        // The first digit may not actually be a digit if number is hexadecimal or binary
        let num = valueOf(current.value);
        if (num === undefined) {
            error("INVALID_NUMBER", `Expected digit following numeric prefix`);
            return { type: "value", value: 0, startLine, startChar };
        }

        // Add subsequent digits
        while (true) {
            const digitValue = valueOf(peeked.value);
            if (digitValue === undefined) {
                break;
            }
            next();
            num = num * base + digitValue;
        }

        if (base === 10 && peeked.value === ".") {
            next();
            let fraction = "";
            while (true) {
                const digitValue = valueOf(peeked.value);
                if (digitValue === undefined) {
                    break;
                }
                fraction += peeked.value;
                next();
            }
            num = Number.parseFloat(`${num}.${fraction}`);
        }

        // Handle specialized suffices for percents and temperatures
        if (peeked.value === "%") {
            next();
            return { type: "value", value: FieldValue.Percent(num), startLine, startChar };
        } else if (peeked.value === "°") {
            next();
            if (peeked.value?.toLowerCase() === "c") {
                next();
            }
            return { type: "value", value: FieldValue.Celsius(num), startLine, startChar };
        }

        // No special suffix; return raw value
        return { type: "value", value: num, startLine, startChar };
    }

    while (!current.done) {
        switch (current.value) {
            case "|":
            case "^":
            case "&":
            case ".":
            case ",":
            case "[":
            case "]":
            case "(":
            case ")":
            case "{":
            case "}":
            case "-":
            case "+":
            case "/":
            case "*":
                yield { type: current.value, startLine: line, startChar: char };
                break;

            case "0":
                markStart();

                if (current.value === "0") {
                    if (peeked.value === "x") {
                        next();
                        next();
                        yield tokenizeDigits(16, hexadecimalValueOf);
                        break;
                    }

                    if (peeked.value === "b") {
                        next();
                        next();
                        yield tokenizeDigits(2, binaryValueOf);
                    }
                }

                yield tokenizeDigits(10, decimalValueOf);
                break;

            case "1":
            case "2":
            case "3":
            case "4":
            case "5":
            case "6":
            case "7":
            case "8":
            case "9":
                yield tokenizeDigits(10, decimalValueOf);
                break;

            case "!":
            case ">":
            case "<":
                {
                    const base = current.value;
                    if (peeked.value === "=") {
                        const type = `${base}${peeked.value}` as BasicToken.Operator;
                        next();
                        yield {
                            type,
                            startLine: line,
                            startChar: char,
                        };
                    } else {
                        yield { type: base, startLine: line, startChar: char };
                    }
                }
                break;

            case "=":
                markStart();
                if (peeked.value === "=") {
                    next();
                } else {
                    error("BAD_EQUAL", `"=" must be followed by another "="`);
                }
                yield { type: "==", startLine, startChar };
                break;

            case "\n":
                line++;
                char = 0;
                break;

            case " ":
            case "\t":
            case "\r":
            case "\v":
            case "\f":
                break;

            default:
                if (isNameChar(current.value)) {
                    markStart();
                    yield tokenizeName();
                } else {
                    error("GARBAGE_CHARACTER", `Unexpected character "${current.value}"`);
                }
                break;
        }
        next();
    }
}
