/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Producer } from "./producer.js";
import {
    Color,
    EightBitColor,
    ExtendedColor,
    RgbColor,
    SgrOpcode,
    SgrOpcodeBlock,
    SgrOpcodeToUndoOpcode,
} from "./sgr.js";
import { Style } from "./style.js";
import { TextWriter } from "./text-writer.js";

/**
 * Convenience API for building ANSI text.
 *
 * Allows you to create ANSI escape sequences using e.g. `ansi.bright.yellow.bg.blue.blink`.
 */
export interface TextBuilder extends Style {
    (...text: Producer.Sequence): TextBuilder;

    readonly state: TextBuilder.State;
    readonly bg: TextBuilder;
    readonly not: TextBuilder;
    readonly reset: TextBuilder;
    readonly bold: TextBuilder;
    readonly dim: TextBuilder;
    readonly bright: TextBuilder;
    readonly italic: TextBuilder;
    readonly underline: TextBuilder;
    readonly doubleUnderline: TextBuilder;
    readonly blink: TextBuilder;
    readonly fastBlink: TextBuilder;
    readonly invert: TextBuilder;
    readonly conceal: TextBuilder;
    readonly strike: TextBuilder;
    readonly black: TextBuilder;
    readonly red: TextBuilder;
    readonly green: TextBuilder;
    readonly yellow: TextBuilder;
    readonly blue: TextBuilder;
    readonly magenta: TextBuilder;
    readonly cyan: TextBuilder;
    readonly white: TextBuilder;
    color(color: Color | EightBitColor | RgbColor): TextBuilder;

    factory: TextBuilder.Factory;
}

export function TextBuilder(
    definition?: Style.InputDefinition | Style,
    derivesFrom?: Style,
    state?: TextBuilder.State,
) {
    if (derivesFrom instanceof TextBuilder) {
        state = { ...(derivesFrom as TextBuilder).state, ...state };
    } else if (state === undefined) {
        state = {};
    }

    definition = Style.definitionOf(definition);

    const self = function TextBuilderInstance(...text: Producer.Sequence) {
        const sequence = self.state.sequence ? [...self.state.sequence] : [];
        if (self.styleDefinition?.length) {
            sequence.push(self.styleToken);
        }
        sequence.push(...text);
        return TextBuilder(self, self, { sequence, revert: true });
    } as TextBuilder;

    Object.setPrototypeOf(self, TextBuilder.prototype);

    (self as any).state = state;

    if (definition !== undefined) {
        self.styleDefinition = definition;
    }

    return self;
}

TextBuilder.prototype = Object.create(Style.prototype, {
    bg: chmode({ bg: true }),
    not: chmode({ not: true }),
    bold: toggle("bold"),
    dim: toggle("dim"),
    bright: chmode({ bright: true }),
    italic: toggle("italic"),
    underline: toggle("underline"),
    doubleUnderline: toggle("doubleUnderline"),
    slowBlink: toggle("slowBlink"),
    fastBlink: toggle("fastBlink"),
    invert: toggle("invert"),
    conceal: toggle("conceal"),
    strike: toggle("strike"),
    black: color("black"),
    red: color("red"),
    green: color("green"),
    yellow: color("yellow"),
    blue: color("blue"),
    magenta: color("magenta"),
    cyan: color("cyan"),
    white: color("white"),

    reset: {
        get() {
            return (this as TextBuilder).addStyle([0]);
        },
    },

    color: {
        value(this: TextBuilder, color: Color | EightBitColor | RgbColor) {
            if (this.state.not) {
                return this.addStyle([this.state.bg ? SgrOpcode.normalBg : SgrOpcode.normalFg]);
            }

            if (typeof color === "object") {
                if ("color" in color) {
                    return this.addStyle([Color.extended, ExtendedColor.eightBit, color.color]);
                }
                return this.addStyle([Color.extended, ExtendedColor.rgb, color.r ?? 0, color.g ?? 0, color.b ?? 0]);
            }

            const block = this.state.bg
                ? this.state.bright
                    ? SgrOpcodeBlock.bgBright
                    : SgrOpcodeBlock.bg
                : this.state.bright
                  ? SgrOpcodeBlock.fgBright
                  : SgrOpcodeBlock.fg;

            return this.addStyle([block + color]);
        },
    },

    toString: {
        value(this: TextBuilder) {
            let { sequence } = this.state;
            if (!sequence) {
                sequence = [this.styleToken];
            }

            if (this.state.revert) {
                sequence = [...sequence, this.undoStyle.styleToken];
            }

            const parts = Array<string>();

            const writer = new TextWriter(part => parts.push(part));
            writer.write(...sequence);
            writer.close();

            return parts.join("");
        },
    },

    [Symbol.iterator]: {
        get(this: TextBuilder) {
            if (this.state.sequence === undefined) {
                return {
                    next() {
                        return undefined;
                    },

                    done: true,
                };
            }
            let sequence = this.state.sequence;
            if (this.state.revert) {
                sequence = [...sequence, this.undoStyle.styleToken];
            }
            const iterable = Producer.of(sequence);
            return iterable[Symbol.iterator].bind(iterable);
        },
    },

    factory: {
        value: TextBuilder,
    },
});

function chmode(state?: TextBuilder.State) {
    return {
        get(this: TextBuilder) {
            return TextBuilder(this, this, state);
        },
    };
}

function toggle(name: keyof typeof SgrOpcode) {
    const on = SgrOpcode[name];
    const off = SgrOpcodeToUndoOpcode[on];
    if (off === undefined) {
        throw new Error(`Can't toggle opcode ${on}`);
    }

    return {
        get(this: TextBuilder) {
            return this.addStyle([this.state.not ? off : on]);
        },
    };
}

function color(color: keyof typeof Color) {
    const opcode = Color[color];
    return {
        get(this: TextBuilder) {
            return this.color(opcode);
        },
    };
}

export namespace TextBuilder {
    export interface State {
        /**
         * If next build affects a color it will modify bg rather than fg.
         */
        readonly bg?: boolean;

        /**
         * If next build affects 8-bit color the color will render as bright.
         */
        readonly bright?: boolean;

        /**
         * If next build modifies ANSI styling its meaning is inverted.
         */
        readonly not?: boolean;

        /**
         * Serialization will include style reversion as the final token.
         *
         * Set after invoking builder as function, cleared when modifying style.  This means that ansi.red("foo") is
         * terminated but ansi.red("foo").green will render as a red "foo" and leave text styled green.
         */
        readonly revert?: boolean;

        /**
         * The serialization sequence.  Populated by invoking builder as function.
         */
        readonly sequence?: Producer.Sequence;
    }

    export type Factory = (
        definition?: Style.Definition | Style,
        derivesFrom?: Style,
        state?: TextBuilder.State,
    ) => TextBuilder;
}

/**
 * Initial builder.
 */
export const ansi = TextBuilder();
