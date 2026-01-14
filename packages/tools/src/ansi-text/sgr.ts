/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SGR (select graphics rendition) opcodes.
 *
 * SGR is a CSI (ANSI "control sequence introducer", or ESC-[) sequence terminated by "m".
 */
export enum SgrOpcode {
    reset = 0,
    bold = 1,
    dim = 2,
    italic = 3,
    underline = 4,
    slowBlink = 5,
    fastBlink = 6,
    invert = 7,
    conceal = 8,
    strike = 9,
    normalFont = 10,
    gothic = 20,
    doubleUnderline = 21,
    normalIntensity = 22,
    notItalic = 23,
    notUnderline = 24,
    notBlink = 25,
    notInvert = 27,
    notConceal = 28,
    notStrike = 29,
    normalFg = 39,
    normalBg = 49,
}

/**
 * SGR categories.
 *
 * Each of these is cleared via a single opcode.  Except for intensity (dim/bold) only one value may be in effect.
 */
export enum SgrCategory {
    reset,
    intensity,
    italic,
    underline,
    blink,
    invert,
    conceal,
    strike,
    font,
    fg,
    bg,
}

/**
 * Masks for meaningful groups of CSI codes.
 */
export enum SgrOpcodeBlock {
    font = 10,
    fg = 30,
    bg = 40,
    fgBright = 90,
    bgBright = 100,
}

/**
 * Color selectors.
 */
export enum Color {
    black = 0,
    red = 1,
    green = 2,
    yellow = 3,
    blue = 4,
    magenta = 5,
    cyan = 6,
    white = 7,
    extended = 8,
}

/**
 * Extended color subselectors.
 */
export enum ExtendedColor {
    rgb = 2,
    eightBit = 5,
}

/**
 * Mapping of opcodes to categories.
 */
export const SgrOpcodeToCategory = Array<number | undefined>(110);

/**
 * Mapping of opcodes to opcodes that disable the attribute.
 */
export const SgrOpcodeToUndoOpcode = Array<number | undefined>(110);

{
    function setCat(code: keyof typeof SgrOpcode, category: keyof typeof SgrCategory, undo?: keyof typeof SgrOpcode) {
        const opcode = SgrOpcode[code];
        SgrOpcodeToCategory[opcode] = SgrCategory[category];
        if (undo !== undefined) {
            SgrOpcodeToUndoOpcode[opcode] = SgrOpcode[undo];
        }
    }

    function setBlockCat(
        block: keyof typeof SgrOpcodeBlock,
        category: keyof typeof SgrCategory,
        undo: keyof typeof SgrOpcode,
    ) {
        const start = SgrOpcodeBlock[block];
        for (let i = SgrOpcodeBlock[block]; i < start + 10; i++) {
            SgrOpcodeToCategory[i] = SgrCategory[category];
            SgrOpcodeToUndoOpcode[i] = SgrOpcode[undo];
        }
    }

    setCat("reset", "reset");
    setCat("dim", "intensity", "normalIntensity");
    setCat("bold", "intensity", "normalIntensity");
    setCat("normalIntensity", "intensity");
    setCat("italic", "italic", "notItalic");
    setCat("notItalic", "italic");
    setCat("underline", "underline", "notUnderline");
    setCat("doubleUnderline", "underline", "notUnderline");
    setCat("notUnderline", "underline");
    setCat("fastBlink", "blink", "notBlink");
    setCat("slowBlink", "blink", "notBlink");
    setCat("notBlink", "blink");
    setCat("invert", "invert", "notInvert");
    setCat("notInvert", "invert");
    setCat("conceal", "conceal", "notConceal");
    setCat("notConceal", "conceal");
    setCat("strike", "strike", "notStrike");
    setCat("notStrike", "strike");
    setBlockCat("font", "font", "normalFont");
    setBlockCat("fg", "fg", "normalFg");
    setBlockCat("fgBright", "fg", "normalFg");
    setBlockCat("bg", "bg", "normalBg");
    setBlockCat("bgBright", "bg", "normalBg");
}

export interface EightBitColor {
    color: number;
}

export interface RgbColor {
    r?: number;
    g?: number;
    b?: number;
}
