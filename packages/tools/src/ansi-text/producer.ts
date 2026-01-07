/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Token } from "./token.js";
import { tokenize } from "./tokenize.js";

/**
 * A source of ANSI tokens.
 */
export interface Producer extends Iterable<Token, void, void> {}

export namespace Producer {
    export interface Sequence extends Array<string | Token | Producer> {}

    export function* of(sequence: Sequence): Producer {
        for (const item of sequence) {
            if (typeof item === "string") {
                yield* tokenize(item);
            } else if (Symbol.iterator in item) {
                yield* item;
            } else {
                yield item;
            }
        }
    }
}
