/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Consumer } from "./consumer.js";
import { Producer } from "./producer.js";
import { Truncator } from "./truncator.js";
import { Wrapper } from "./wrapper.js";

/**
 * Text output with high-level formatting functionality.
 */
export interface Printer extends Consumer {
    (...text: Producer.Sequence): void;

    target: Consumer;

    writeTruncated(...text: Producer.Sequence): void;
    writeTruncatedLine(...text: Producer.Sequence): void;
}

export function Printer(target: Consumer, options?: Printer.Options) {
    target = options?.wrap ? new Wrapper(target, options.wrap) : target;
    let truncator: undefined | Truncator;

    const printer = function Printer(...text: Producer.Sequence) {
        printer.write(...text);
    } as Printer;

    Object.defineProperties(printer, {
        target: {
            get() {
                return target;
            },
        },

        state: {
            get() {
                return target.state;
            },
        },

        write: {
            value(...text: Producer.Sequence) {
                target.write(...text);
            },
        },

        close: {
            value() {
                target.close();
            },
        },

        writeTruncated: {
            value(...text: string[]) {
                if (!truncator) {
                    truncator = new Truncator(target, { addNewline: false });
                }
                truncator.write(...text);
            },
        },

        writeTruncatedLine: {
            value(...text: string[]) {
                const tokens = [...Producer.of(text)].filter(
                    token => token.kind !== "newline" && token.kind !== "carriage-return",
                );
                if (!truncator) {
                    truncator = new Truncator(target);
                }
                truncator.write(...tokens);
            },
        },
    });

    return printer;
}

export namespace Printer {
    export interface Options extends Consumer.Options {
        wrap?: Wrapper.Options;
    }
}
