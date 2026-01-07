/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Producer } from "./producer.js";
import { BreakingToken, NonbreakingToken, Token } from "./token.js";

/**
 * A single output segment that should be presented contiguously if space allows.
 */
export class ContiguousOutputSegment implements Producer {
    width = 0;
    tokens: Token[];

    constructor(...text: Producer.Sequence) {
        this.tokens = [...Producer.of(text)];
        this.#addWidth(this.tokens);
    }

    [Symbol.iterator]() {
        return this.tokens[Symbol.iterator]();
    }

    push(...text: Producer.Sequence) {
        const tokens = [...Producer.of(text)];
        this.tokens.push(...tokens);
        this.#addWidth(tokens);
    }

    #addWidth(tokens: Token[]) {
        for (const token of tokens) {
            if ("width" in token) {
                this.width += token.width;
            }
        }
    }

    /**
     * Create a scanner that can be used to move through the segment in chunks of visible characters.  This is only
     * necessary when wrapping segments that are too long to fit on a single line.
     */
    scan(): ContiguousOutputSegment.Scanner {
        let done = false;
        const iterator = this.tokens[Symbol.iterator]();
        let current: BreakingToken | NonbreakingToken | undefined;
        let pos = 0;
        return {
            [Symbol.iterator]() {
                return iterator;
            },

            get done() {
                return done;
            },

            next() {
                const next = iterator.next();
                if (next.done) {
                    done = true;
                }
                return next;
            },

            take(width: number) {
                let widthSoFar = 0;
                const result = Array<Token>();
                while (true) {
                    if (current !== undefined) {
                        const splitStart = pos;
                        let splitWidth = 0;
                        for (let i = splitStart; i < current.str.length; i++) {
                            const charCode = current.str.charCodeAt(0);

                            // Zero-width characters
                            switch (charCode) {
                                case 0x200b:
                                case 0x200c:
                                case 0x200d:
                                case 0x2060:
                                case 0xfeff:
                                    continue;
                            }

                            // If we've hit the target width, split the current token if any portion of it fits and
                            // we are done
                            if (widthSoFar === width) {
                                pos = i;
                                if (splitStart !== pos) {
                                    result.push({
                                        kind: current.kind,
                                        str: current.str.slice(splitStart, pos),
                                        width: splitWidth,
                                    });
                                }
                                return result;
                            }

                            // Increase width
                            widthSoFar++;
                            splitWidth++;

                            // Skip properly formed surrogate pair
                            if (charCode >= 0xd800 && charCode < 0xdc00) {
                                const charCode2 = current.str.charCodeAt(i + 1);
                                if (charCode2 !== undefined && charCode2 >= 0xdc00 && charCode2 < 0xe000) {
                                    i++;
                                }
                            }
                        }

                        // The remainder of the current token fits so we are done with it
                        if (splitStart === 0) {
                            // Entire token
                            result.push(current);
                        } else {
                            // Tailing portion of token
                            result.push({
                                kind: current.kind,
                                str: current.str.slice(splitStart),
                                width: splitWidth,
                            });
                        }

                        current = undefined;
                    }

                    // Process next token
                    const n = this.next();
                    if (n.done) {
                        return result;
                    }

                    // Control sequences do not contribute space
                    if (n.value.kind !== "breaking" && n.value.kind !== "nonbreaking") {
                        result.push(n.value);
                        continue;
                    }

                    // Space and visible tokens require code unit scan
                    current = n.value;
                }
            },
        };
    }

    toString() {
        return this.tokens
            .map(token => {
                switch (token.kind) {
                    case "style":
                        return token.style.toString();

                    case "ansi":
                        return token.sequence;

                    case "breaking":
                    case "nonbreaking":
                        return token.str;

                    case "tab":
                        return "\t";

                    case "carriage-return":
                        return "\r";

                    case "newline":
                        return "\n";
                }
            })
            .join("");
    }
}

export namespace ContiguousOutputSegment {
    export interface Scanner extends IterableIterator<Token> {
        done: boolean;
        take(width: number): Token[];
    }
}
