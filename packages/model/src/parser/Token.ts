/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue } from "../common/index.js";

/**
 * A single token for the parser.
 */
export interface Token {
    type: string;
    startLine: number;
    startChar: number;
}

/**
 * The base token produced by the tokenizer.
 */
export type BasicToken<KW extends readonly string[] = []> =
    | BasicToken.Special
    | BasicToken.Word
    | BasicToken.Number
    | BasicToken.Keyword<KW>;

/**
 * A {@link BasicToken} with additional keywords.
 */
export type ExtendedToken<K extends string> = BasicToken | (Token & { type: K[number] });

export namespace BasicToken {
    export type Operator =
        | "!"
        | "=="
        | "!="
        | "|"
        | "^"
        | "&"
        | "."
        | ","
        | "["
        | "]"
        | "("
        | ")"
        | "{"
        | "}"
        | "-"
        | "+"
        | "*"
        | "/"
        | ">"
        | "<"
        | ">="
        | "<=";

    export interface Special extends Token {
        type: Operator;
    }

    export interface Word extends Token {
        type: "word";
        value: string;
    }

    export interface Number extends Token {
        type: "value";
        value: FieldValue;
    }

    export interface Keyword<T extends readonly string[]> extends Token {
        type: T[number];
    }
}
