/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Consumer } from "./consumer.js";
import { ContiguousOutputSegment } from "./contiguous-output-segment.js";
import { Producer } from "./producer.js";
import { Style } from "./style.js";
import { type TextWriter } from "./text-writer.js";
import { Token } from "./token.js";
import { tokenize } from "./tokenize.js";

const NEWLINE: Token = { kind: "newline" };
const SPACE: Token = { kind: "nonbreaking", str: " ", width: 1 };

/**
 * Writes to a {@link TextWriter} with support for smart wrapping of text.
 */
export class Wrapper implements Consumer {
    #target: Consumer;
    #wrapPrefix?: ContiguousOutputSegment;
    #preserveIndent: boolean;
    #preserveSpace: boolean;
    #splitStyling: boolean;
    #inputState: "newline" | "prefix" | "indent" | "word" | "space" = "newline";
    #outputState: "newline" | "newwrap" | "inline" = "newline";
    #indent?: ContiguousOutputSegment;
    #output?: ContiguousOutputSegment;

    #onRevert = () => {
        // When state reverts we may have buffered output we have yet to emit.  Do so now to ensure it receives proper
        // styling
        this.#emit();
    };

    constructor(target: Consumer, options: Wrapper.Options) {
        const { wrapPrefix, preserveIndent, splitStyling, preserveSpace } = options;

        this.#target = target;
        if (wrapPrefix !== undefined) {
            this.#wrapPrefix = new ContiguousOutputSegment(...tokenize(wrapPrefix));
        }
        this.#preserveIndent = preserveIndent ?? true;
        this.#preserveSpace = preserveSpace ?? true;
        this.#splitStyling =
            splitStyling ?? !!(this.#preserveIndent || this.#wrapPrefix || !this.#target.state.linePrefix);

        this.#target.state.onRevert(this.#onRevert);
    }

    get state() {
        return this.#target.state;
    }

    write(...text: Producer.Sequence) {
        if (this.#target.state.terminalWidth === undefined) {
            this.#target.write(...text);
            return;
        }

        for (const token of Producer.of(text)) {
            this.#addToken(token);
        }
    }

    close() {
        this.#emit();
        this.#target.state.offRevert(this.#onRevert);
        this.#target.close();
    }

    [Symbol.dispose]() {
        this.close();
    }

    #addToken(token: Token) {
        switch (token.kind) {
            case "newline":
            case "carriage-return":
                this.#emit();
                this.#target.write(token);
                this.#indent = undefined;
                this.#outputState = this.#inputState = "newline";
                break;

            case "ansi":
                switch (token.sequence) {
                    case Wrapper.prefixStart:
                        this.#inputState = "prefix";
                        break;

                    case Wrapper.prefixStop:
                        this.#inputState = "indent";
                        break;

                    default:
                        // Note that we don't enqueue above codes as they are private and intended only for internal
                        // use.
                        this.#enqueue(token);
                        break;
                }
                break;

            case "style":
                this.#enqueue(token);
                break;

            case "nonbreaking":
                if (this.#inputState === "prefix") {
                    this.#enqueue(token);
                    break;
                }
                if (this.#inputState === "indent") {
                    this.#indent = this.#output;
                    this.#output = undefined;
                }
                this.#inputState = "word";
                this.#enqueue(token);
                break;

            case "tab":
            case "breaking":
                switch (this.#inputState) {
                    case "newline":
                        if (this.#preserveIndent) {
                            this.#enqueue(token);
                        }
                        this.#inputState = "indent";
                        break;

                    case "prefix":
                    case "indent":
                        this.#enqueue(token);
                        break;

                    case "word":
                    case "space":
                        if (this.#preserveSpace) {
                            this.#enqueue(token);
                        }
                        this.#emit();
                        this.#inputState = "space";
                        break;
                }
                break;
        }
    }

    #emit() {
        if (this.#output === undefined) {
            return;
        }

        const outputState = this.#outputState;
        if (outputState === "newline") {
            this.#emitPrefix();
        }
        this.#outputState = "inline";

        const output = this.#output;
        this.#output = undefined;

        let remainingWidth = this.#target.state.remainingWidth!;

        // Leave room for a space except at the beginning of the line
        if (!this.#preserveSpace && remainingWidth !== undefined && outputState === "inline") {
            remainingWidth--;
        }

        // Ideal case - not wrapping or segment fits on current line
        if (remainingWidth === undefined || output.width <= remainingWidth) {
            if (outputState === "inline" && !this.#preserveSpace) {
                this.#target.write(SPACE);
            }
            this.#target.write(...output.tokens);
            return;
        }

        // Least ideal case - the first- or tertiary- prefix fills up the line by itself.  Give up on wrapping
        const wrapPrefixWidth = (this.#wrapPrefix?.width ?? 0) + (this.#indent?.width ?? 0);
        const availableWrappedWidth = this.#target.state.availableWidth! - wrapPrefixWidth;
        if ((outputState === "newline" && remainingWidth <= 0) || availableWrappedWidth < 0) {
            this.#target.write(...output.tokens);
            return;
        }

        // Second best case - the segment fits on a new line
        if (output.width < availableWrappedWidth) {
            this.#wrap();
            this.#target.write(...output.tokens);
            return;
        }

        // Third best case - we need to wrap the segment itself
        const scanner = output.scan();
        if (outputState === "inline" && !this.#preserveSpace) {
            this.#target.write(SPACE);
        }
        this.#target.write(...scanner.take(remainingWidth));
        while (!scanner.done) {
            this.#wrap();
            this.#target.write(...scanner.take(availableWrappedWidth));
        }
    }

    #emitPrefix(extra?: ContiguousOutputSegment) {
        if (this.#indent !== undefined) {
            this.#target.write(...this.#indent.tokens);
        }
        if (extra !== undefined) {
            this.#target.write(...extra.tokens);
        }
    }

    #wrap() {
        let style: Style | undefined;
        if (this.#splitStyling) {
            style = this.#target.state.style;
            this.#target.write({ kind: "style", style: Style.None });
        }
        this.#target.write(NEWLINE);
        this.#emitPrefix(this.#wrapPrefix);
        if (style) {
            this.#target.write({ kind: "style", style });
        }
    }

    #enqueue(token: Token) {
        if (this.#output) {
            this.#output.push(token);
        } else {
            this.#output = new ContiguousOutputSegment(token);
        }
    }
}

export namespace Wrapper {
    export interface Options {
        wrapPrefix?: string;
        preserveIndent?: boolean;
        preserveSpace?: boolean;
        splitStyling?: boolean;
    }

    /**
     * Private - begin demarcation of line prefix.
     */
    export const prefixStart = "\x1b[<<~";

    /**
     * Private - end demarcation of line prefix.
     */
    export const prefixStop = "\x1b[>>~";
}
