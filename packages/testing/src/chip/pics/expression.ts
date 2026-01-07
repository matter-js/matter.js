/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PicsFile } from "./file.js";

/**
 * A set of PICS specifiers, each of which must be true for the set to apply.
 */
export class PicsExpression {
    #definition: string;
    #ast: Ast;

    constructor(definition: string) {
        this.#definition = definition;
        this.#ast = parse(definition);
    }

    evaluate(file: PicsFile) {
        return test(this.#ast, file);
    }

    toString() {
        return this.#definition;
    }
}

interface Name {
    kind: "name";
    name: string;
}

interface Unary {
    kind: "!";
    operand: Ast;
}

interface Binary {
    kind: "&" | "|";
    lhs: Ast;
    rhs: Ast;
}

type Ast = Name | Unary | Binary;

export class InvalidPicsExpressionError extends Error {
    constructor(definition: string, token?: Token) {
        let why;
        if (token === undefined) {
            why = "Incomplete PICS expression";
        } else {
            why = `Unexpected "${token.kind === "name" ? token.name : token.kind}`;
        }
        super(`Invalid PICS expression "${definition}": ${why}`);
    }
}

function parse(definition: string) {
    const tokenizer = tokenize(definition);

    function parsePrefix(): Ast {
        const token = tokenizer.next();

        switch (token?.kind) {
            case "name":
                return token;

            case "(":
                const result = parseExpr();
                if (tokenizer.peek()?.kind !== ")") {
                    throw new InvalidPicsExpressionError(definition, tokenizer.peek());
                }
                tokenizer.next();
                return result;

            case "!":
                return {
                    kind: "!",
                    operand: parsePrefix(),
                };
        }

        throw new InvalidPicsExpressionError(definition, token);
    }

    function parseExpr(): Ast {
        const expr = parsePrefix();

        switch (tokenizer.peek()?.kind) {
            case "&":
                tokenizer.next();
                return {
                    kind: "&",
                    lhs: expr,
                    rhs: parseExpr(),
                };

            case "|":
                tokenizer.next();
                return {
                    kind: "|",
                    lhs: expr,
                    rhs: parseExpr(),
                };

            default:
                return expr;
        }
    }

    const result = parseExpr();

    // Note - allow garbage trailing "(" as this seems to be a way to provide a hint as to purpose of expression
    if (tokenizer.peek() !== undefined && tokenizer.peek()?.kind !== "(") {
        throw new InvalidPicsExpressionError(definition, tokenizer.peek());
    }

    return result;
}

const SYMBOLS = ["&", "|", "!", "(", ")"] as const;
type SymbolName = (typeof SYMBOLS)[number];

type Token = { kind: SymbolName } | Name;

const WHITESPACE = new Set([" ", "\r", "\n", "\t"]);
const SYMBOL_SET = new Set<string>(SYMBOLS);

interface Tokenizer {
    next(): Token | undefined;
    peek(): Token | undefined;
}

function tokenize(definition: string): Tokenizer {
    const iterator = tokenizer(definition);
    let next = iterator.next();

    return {
        next() {
            if (!next.done) {
                const value = next.value;
                next = iterator.next();
                return value;
            }
        },

        peek() {
            return next.value;
        },
    };
}

function* tokenizer(definition: string): Generator<Token, undefined> {
    let pos = 0;
    while (pos < definition.length) {
        let ch = definition[pos];

        switch (ch) {
            case "&":
            case "|":
            case "!":
            case "(":
            case ")":
                yield { kind: ch };
                break;

            default:
                if (WHITESPACE.has(ch)) {
                    break;
                }
                const name = [ch];
                while (true) {
                    ch = definition[pos + 1];
                    if (ch === undefined || WHITESPACE.has(ch) || SYMBOL_SET.has(ch)) {
                        break;
                    }
                    name.push(ch);
                    pos++;
                }
                yield { kind: "name", name: name.join("") };
                break;
        }
        pos++;
    }
}

function test(ast: Ast, file: PicsFile): boolean {
    switch (ast.kind) {
        case "!":
            return !test(ast.operand, file);

        case "name":
            return file.values[ast.name] === 1;

        case "&":
            return test(ast.lhs, file) && test(ast.rhs, file);

        case "|":
            return test(ast.lhs, file) || test(ast.rhs, file);

        default:
            throw new Error(`Internal error: Invalid PICS AST kind "${(ast as any).kind}"`);
    }
}
