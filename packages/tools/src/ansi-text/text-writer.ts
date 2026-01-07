/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Consumer } from "./consumer.js";
import { ContiguousOutputSegment } from "./contiguous-output-segment.js";
import { Producer } from "./producer.js";
import { SgrOpcode } from "./sgr.js";
import { Style } from "./style.js";
import { Token } from "./token.js";
import { tokenize } from "./tokenize.js";

const DEFAULT_TAB_WIDTH = 4;

/**
 * Low-level text output with ANSI escape sequences, maintaining state regarding style and width of current line.
 */
export class TextWriter implements Consumer {
    tabWidth: number;

    #terminalWidth?: number;
    #currentLineWidth = 0;
    #out: (text: string) => void;
    #activeStyle = Style.Inherit;
    #styleDirty = true;
    #currentStyle = Style.Inherit;
    #linePrefix?: ContiguousOutputSegment;
    #state: Consumer.State;
    #styleEnabled = true;
    #isNewLine = true;
    #buffer?: string[];
    #revertHandlers?: Set<() => void>;

    constructor(out: (text: string) => void, options?: Writer.Options) {
        const { tabWidth, terminalWidth, linePrefix } = options ?? {};
        this.#out = out;
        this.tabWidth = tabWidth ?? DEFAULT_TAB_WIDTH;
        this.#terminalWidth = terminalWidth;
        if (linePrefix) {
            this.#linePrefix = new ContiguousOutputSegment(...tokenize(linePrefix));
        }

        const self = this;

        this.#state = function state(options?: Consumer.Options, executor?: () => void): Consumer.Context | undefined {
            options = { ...options };

            const revertTo = { ...self.state, options } as Consumer.Options;

            const { linePrefix, style, buffer } = options;
            if (linePrefix) {
                if (self.#linePrefix) {
                    self.#linePrefix.push(linePrefix);
                } else {
                    self.#linePrefix = new ContiguousOutputSegment(linePrefix);
                }
            }

            if (style) {
                if (self.#currentStyle) {
                    self.#currentStyle = self.#currentStyle.addStyle(style);
                } else {
                    self.#currentStyle = style;
                }
                self.#styleDirty = true;
            }

            if (!!buffer !== !!self.#buffer) {
                if (buffer) {
                    self.#buffer = [];
                } else {
                    self.#buffer = undefined;
                }
            }

            const context = {
                close() {
                    if (self.#revertHandlers) {
                        for (const fn of self.#revertHandlers) {
                            fn();
                        }
                    }

                    if (revertTo.style) {
                        revertTo.style = self.#currentStyle.undoStyle.addStyle(revertTo.style);
                    } else {
                        revertTo.style = Style.None;
                    }

                    for (const key in revertTo) {
                        (self.state as any)[key] = (revertTo as any)[key];
                    }
                },

                [Symbol.dispose]() {
                    this.close();
                },
            };

            if (executor) {
                try {
                    executor();
                } finally {
                    context.close();
                }
            } else {
                return context;
            }
        } as Consumer.State;

        Object.defineProperties(this.#state, {
            style: {
                get(this: never) {
                    return self.#currentStyle;
                },

                set(this: never, style) {
                    self.#currentStyle = style ?? Style.Inherit;
                    self.#styleDirty = true;
                },

                enumerable: true,
            },

            linePrefix: {
                get(this: never) {
                    return self.#linePrefix?.toString();
                },

                set(this: never, prefix) {
                    if (prefix) {
                        self.#linePrefix = new ContiguousOutputSegment(...tokenize(prefix));
                    } else {
                        self.#linePrefix = undefined;
                    }
                },

                enumerable: true,
            },

            terminalWidth: {
                get(this: never) {
                    return self.#terminalWidth;
                },

                set(this: never, width: number | undefined) {
                    self.#terminalWidth = width;
                },

                enumerable: true,
            },

            styleEnabled: {
                get(this: never) {
                    return self.#styleEnabled;
                },

                set(this: never, enabled: boolean) {
                    self.#styleEnabled = enabled;
                },

                enumerable: true,
            },

            availableWidth: {
                get(this: never) {
                    if (self.#terminalWidth === undefined) {
                        return undefined;
                    }

                    if (self.#linePrefix) {
                        const width = self.#terminalWidth - self.#linePrefix.width;
                        if (width > 0) {
                            return width;
                        }
                        return undefined;
                    }

                    return self.#terminalWidth;
                },
            },

            remainingWidth: {
                get(this: never) {
                    if (self.#terminalWidth === undefined) {
                        return undefined;
                    }
                    return self.#terminalWidth - self.#currentLineWidth;
                },
            },

            buffer: {
                get(this: never) {
                    return !!self.#buffer;
                },

                set(this: never, buffering: boolean) {
                    if (!!self.#buffer === buffering) {
                        return;
                    }
                    if (buffering) {
                        self.#buffer = [];
                        return;
                    }
                    if (self.#buffer) {
                        self.#out(self.#buffer.join(""));
                        self.#buffer = undefined;
                    }
                },

                enumerable: true,
            },

            onRevert: {
                value(fn: () => void) {
                    if (!self.#revertHandlers) {
                        self.#revertHandlers = new Set();
                    }
                    self.#revertHandlers.add(fn);
                },
            },

            offRevert: {
                value(fn: () => void) {
                    if (self.#revertHandlers) {
                        self.#revertHandlers.add(fn);
                    }
                },
            },
        });
    }

    get state() {
        return this.#state;
    }

    write(...text: Producer.Sequence) {
        for (const token of Producer.of(text)) {
            if (token.kind === "ansi" && (token.sequence.startsWith("\x1b[<") || token.sequence.startsWith("\x1b[>"))) {
                // We reserve these prefices for internal use and some terminals (ahem github) don't properly hide the
                // entire sequence
                continue;
            }

            this.#addToken(token);
        }
    }

    close() {
        this.#writeStyle();
    }

    /**
     * Reset styling.
     */
    reset() {
        if (this.#currentStyle.styleCodes.find(code => code !== SgrOpcode.reset)) {
            this.#currentStyle = Style.None;
            this.#styleDirty = true;
        }
    }

    #addToken(token: Token, forLinePrefix = false) {
        if (this.#isNewLine && this.#linePrefix && !forLinePrefix) {
            this.#isNewLine = false;
            const style = this.#currentStyle;
            this.#currentStyle = Style.None;
            this.#styleDirty = true;
            for (const token of this.#linePrefix.tokens) {
                this.#addToken(token, true);
            }
            this.#currentStyle = style;
            this.#styleDirty = true;
        }

        switch (token.kind) {
            case "newline":
                this.#emitLine("\n");
                break;

            case "carriage-return":
                this.#emitLine("\r");
                break;

            case "tab":
                let width = this.tabWidth - (this.#currentLineWidth % this.tabWidth);
                if (width === 0) {
                    width = this.tabWidth;
                }
                this.#writeText("".padStart(width));
                this.#currentLineWidth += width;
                break;

            case "breaking":
                this.#writeText(token.str);
                this.#currentLineWidth += token.width;
                break;

            case "style":
                this.#currentStyle = this.#currentStyle.addStyle(token.style);
                this.#styleDirty = true;
                break;

            case "ansi":
                if (this.#styleEnabled) {
                    this.#writeText(token.sequence);
                }
                if (token.newColumn !== undefined) {
                    // TODO - don't need to support yet but to be correct should adjust sequence to account for indent
                    if (!this.#currentLineWidth) {
                        this.#isNewLine = true;
                    }
                    this.#currentLineWidth = token.newColumn;
                }
                break;

            case "nonbreaking":
                this.#writeText(token.str);
                this.#currentLineWidth += token.width;
                break;
        }
    }

    #writeText(text: string) {
        this.#writeStyle();
        this.#emit(text);
    }

    #writeStyle() {
        if (this.#styleDirty && this.#styleEnabled) {
            this.#styleDirty = false;

            this.#emit(this.#activeStyle.diffStyle(this.#currentStyle).toString());

            this.#activeStyle = this.#currentStyle;
        }
    }

    #emit(text: string) {
        if (this.#buffer) {
            this.#buffer.push(text);
        } else {
            this.#out(text);
        }
    }

    #emitLine(terminator?: string) {
        this.#writeStyle();
        this.#beginLine();
        if (terminator) {
            this.#emit(terminator);
        }
    }

    #beginLine() {
        this.#isNewLine = true;
        this.#currentLineWidth = 0;
    }
}

export namespace Writer {
    export interface Options {
        tabWidth?: number;
        terminalWidth?: number;
        linePrefix?: string;
    }
}
