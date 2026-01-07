/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Consumer } from "./consumer.js";
import { ContiguousOutputSegment } from "./contiguous-output-segment.js";
import { Producer } from "./producer.js";

/**
 * Writes lines truncated to a specific width.
 */
export class Truncator implements Consumer {
    #target: Consumer;
    #addNewline: boolean;

    constructor(target: Consumer, options: { addNewline?: boolean } = {}) {
        const { addNewline } = options;
        this.#target = target;
        this.#addNewline = addNewline === undefined ? true : false;
    }

    get state() {
        return this.#target.state;
    }

    write(...text: Producer.Sequence) {
        const width = this.#target.state.remainingWidth;

        if (width === undefined) {
            this.#write(...text);
            return;
        }

        const segment = new ContiguousOutputSegment(...text);
        if (segment.width <= width) {
            this.#write(...segment.tokens);
        } else {
            const scanner = segment.scan();

            this.#write(...scanner.take(width - 1), { kind: "nonbreaking", str: "…", width: 1 });
            for (const token of scanner) {
                if (token.kind === "breaking" || token.kind === "nonbreaking") {
                    continue;
                }
                this.#write(token);
            }
        }
    }

    close() {
        this.#target.close();
    }

    #write(...text: Producer.Sequence) {
        if (this.#addNewline) {
            this.#target.write(...text, { kind: "newline" });
        } else {
            this.#target.write(...text);
        }
    }
}
