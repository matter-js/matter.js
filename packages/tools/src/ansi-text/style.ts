/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Producer } from "./producer.js";
import {
    Color,
    ExtendedColor,
    SgrCategory,
    SgrOpcode,
    SgrOpcodeBlock,
    SgrOpcodeToCategory,
    SgrOpcodeToUndoOpcode,
} from "./sgr.js";
import { Token } from "./token.js";

/**
 * An immutable representation of an ANSI CSI SGR sequence, also known as the "American National Standards Institute
 * Control Sequence Introducer Select Graphic Rendition".
 *
 * Implemented largely from https://en.wikipedia.org/wiki/ANSI_escape_code
 *
 * Provides high level logic for parsing and manipulating styling.
 */
export interface Style extends Producer {
    /**
     * The current definition, either {@link codes} or {@link text}.
     */
    get styleDefinition(): Style.Definition;

    set styleDefinition(definition: Style.InputDefinition | Style | undefined);

    /**
     * The list of codes in this style.
     */
    styleCodes: (string | number)[];

    /**
     * The style as a style token.
     */
    styleToken: Token;

    /**
     * A style that disables this style.
     */
    undoStyle: Style;

    /**
     * Create the ANSI escape sequence for this style.
     */
    toString(): string;

    /**
     * Create a new style by adding additional style information.
     */
    addStyle<T extends Style>(this: T, style: Style.InputDefinition | Style): T;

    /**
     * Create a style that transitions from this style to another.
     */
    diffStyle<T extends Style>(this: T, other: Style): T;

    /**
     * Execute a function against each code in this style's sequence.
     */
    evaluateStyle(processor: (category: SgrCategory, code: number | string) => void): void;

    /**
     * The factory used to create this style.
     */
    factory: Style.Factory;
}

const codes = Symbol("codes");
const text = Symbol("text");

interface InternalStyle extends Style {
    [codes]?: (string | number)[];
    [text]?: string;
}

export function Style(definition?: Style.InputDefinition): Style {
    if (definition instanceof Style) {
        return definition;
    }

    const style = Object.create(Style.prototype) as Style;

    style.styleDefinition = Style.definitionOf(definition);

    return style;
}

export namespace Style {
    export type Factory = (definition?: Definition | Style, derivesFrom?: Style) => Style;
    export type Definition = undefined | string | (string | number)[];
    export type InputDefinition = Definition | { styleDefinition: Definition };

    export function opcodeOf(code: number | string) {
        if (typeof code === "number") {
            return code;
        }

        if (code === "") {
            return 0;
        }

        // Note we must use parseInt so trailing parameters are stripped
        const opcode = Number.parseInt(code);
        if (!Number.isFinite(opcode)) {
            return undefined;
        }

        return opcode;
    }

    export function codesOf(definition?: string): (number | string)[] {
        definition = textOf(definition);
        if (definition === undefined) {
            return [];
        }
        if (definition === "") {
            return [0];
        }

        const parts = definition.split(";");
        const codes = Array<string | number>();
        let pos = 0;
        while (pos < parts.length) {
            const part = parts[pos];
            const opcode = opcodeOf(parts[pos]);
            pos++;

            // Determine how many arguments the code has.  We encode these as a single unit
            let expectedParts;
            switch (opcode) {
                case SgrOpcodeBlock.fg + Color.extended:
                case SgrOpcodeBlock.bg + Color.extended:
                    switch (opcodeOf(parts[pos])) {
                        case ExtendedColor.eightBit:
                            expectedParts = 3;
                            break;

                        case ExtendedColor.rgb:
                            expectedParts = 5;
                            break;

                        default:
                            // Not sure what to make of this; just grab the two prefix codes
                            expectedParts = 1;
                            break;
                    }
                    break;

                case undefined:
                    // Ignore
                    continue;

                default:
                    expectedParts = 0;
                    break;
            }

            // Store the original code as a number if it is encoded as an integer without arguments
            let baseCode: number | string;
            if (opcode.toString() === part) {
                baseCode = opcode;
            } else {
                baseCode = part;
            }

            // Arguments may be encoded in a single code with ":" as separator, or as separate codes if ";" is
            // the separator.  Unsure where which is supported so we just handle both
            if (expectedParts) {
                const codeCount = part.split(":").length;
                if (codeCount < expectedParts) {
                    // At least some args are in subsequent codes; join these together using original separator so
                    // they serialize in original form
                    const argParts = expectedParts - codeCount;
                    codes.push([baseCode, ...parts.slice(pos, pos + argParts)].join(";"));
                    pos += argParts;
                    continue;
                }
            }

            // No args or all args encoded using ":" separator
            codes.push(baseCode);
        }
        return codes;
    }

    export function textOf(definition?: string) {
        if (definition === undefined || definition === "") {
            return definition;
        }
        definition = definition.trim();
        if (definition[0] === "\x1b" && definition[1] === "[") {
            definition = definition.slice(2);
        }
        if (definition[definition.length - 1] === "m") {
            definition = definition.slice(0, definition.length - 1);
        }
        return definition;
    }

    export function definitionOf(definition: InputDefinition): Definition {
        if (definition !== undefined && typeof definition !== "string" && !Array.isArray(definition)) {
            return definition.styleDefinition;
        }
        return definition;
    }

    declare const Inherit: Style;
    declare const None: Style;
}

Style.prototype = {
    get styleDefinition(): Style.Definition {
        if (this[codes] !== undefined) {
            return this[codes];
        }
        if (this[text] !== undefined) {
            return this[text];
        }
    },

    set styleDefinition(definition: Style.InputDefinition) {
        if (typeof definition === "function" || (typeof definition === "object" && !Array.isArray(definition))) {
            this.styleDefinition = definition.styleDefinition;
        } else if (typeof definition === "string") {
            this[text] = Style.textOf(definition);
            this[codes] = undefined;
        } else {
            this[codes] = definition;
            this[text] = undefined;
        }
    },

    get styleCodes() {
        if (this[codes] === undefined) {
            this[codes] = Style.codesOf(this[text]);
        }
        return this[codes] ?? [];
    },

    get styleToken(): Token {
        return {
            kind: "style",

            // Do not use this because extension toString() may not do the correct thing
            style: Style(this.styleDefinition),
        };
    },

    get undoStyle() {
        const codes = Array<number>();
        for (const code of this.styleCodes) {
            const opcode = Style.opcodeOf(code);
            if (opcode === undefined) {
                continue;
            }

            const undo = SgrOpcodeToUndoOpcode[opcode];
            if (undo === undefined) {
                continue;
            }

            codes.push(undo);
        }
        return Style(codes);
    },

    toString() {
        const codes = Array<number | string>();
        for (const code of this.styleCodes) {
            const opcode = Style.opcodeOf(code);
            if (opcode === undefined) {
                continue;
            }

            codes.push(code);
        }
        return `\x1b[${codes.join(";")}m`;
    },

    addStyle<T extends Style>(this: T, codes: Style.InputDefinition): T {
        let categories = Array<number | string>();

        function processor(category: SgrCategory, code: number | string) {
            if (category === SgrCategory.reset) {
                categories = [SgrOpcode.reset];
            } else {
                categories[category] = code;
            }
        }

        // Add my codes
        this.evaluateStyle(processor);

        // Overwrite with new codes
        codes = Style.definitionOf(codes);
        if (codes !== undefined) {
            Style(codes).evaluateStyle(processor);
        }

        return this.factory(
            categories.filter(entry => entry !== undefined),
            this,
        ) as T;
    },

    diffStyle<T extends Style>(this: T, other: Style): T {
        let current = Array<number | string | undefined>();

        // Collect current styles by category.  Reset clears state
        this.evaluateStyle((category: SgrCategory, code: number | string) => {
            if (category === SgrCategory.reset) {
                current = [];
            } else {
                current[category] = code;
            }
        });

        // Collect target style by category.  Reset clears current (because its no longer relevant) and adds the
        // reset which always serializes first
        let target = [...current];
        other.evaluateStyle((category, code) => {
            if (category === SgrCategory.reset) {
                current = [];
                target = [SgrCategory.reset];
            } else if (current[category] === code) {
                target[category] = undefined;
            } else {
                target[category] = code;
            }
        });

        // Target now contains only those codes required to perform transition
        return this.factory(
            target.filter(entry => entry !== undefined),
            this,
        ) as T;
    },

    evaluateStyle(processor: (category: SgrCategory, code: number | string) => void) {
        for (const code of this.styleCodes) {
            const opcode = Style.opcodeOf(code);
            if (opcode !== undefined) {
                const category = SgrOpcodeToCategory[opcode];
                if (category !== undefined) {
                    processor(category, code);
                }
            }
        }
    },

    get factory() {
        return Style;
    },

    [Symbol.iterator]() {
        return [{ kind: "style", style: this as Style } satisfies Token][Symbol.iterator]();
    },
} satisfies Pick<InternalStyle, keyof InternalStyle>;

Style.Inherit = Style();
Style.None = Style([0]);
