/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicToken, Token } from "./Token.js";

/**
 * Token-related state for the parser.
 */
export interface TokenStream<T extends Token> {
    done: boolean;
    description: string;
    token?: T;
    peeked?: T;
    next(): void;
}

export function TokenStream<T extends Token>(iterator: Iterator<T>): TokenStream<T> {
    let done = false;

    function next() {
        if (done) {
            return undefined;
        }
        const n = iterator.next();
        if (n.done) {
            done = true;
        }
        return n.value;
    }

    return {
        token: next(),
        peeked: next(),

        get done() {
            return this.token === undefined;
        },

        next() {
            this.token = this.peeked;
            this.peeked = next();
        },

        get description() {
            switch (this.token?.type) {
                case undefined:
                    return "end of statement";

                case "word":
                    return `word "${(this.token as unknown as BasicToken.Word).value}"`;

                case "value":
                    return `value "${(this.token as unknown as BasicToken.Number).value}"`;

                default:
                    if (this.token?.type.match(/[a-z]/i)) {
                        return `keyword "${this.token?.type}"`;
                    }
                    return `operator "${this.token?.type}"`;
            }
        },
    };
}
