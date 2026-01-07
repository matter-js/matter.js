/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Style } from "./style.js";

/**
 * An individual lexical token in a Unicode string with ANSI escape codes.
 */
export type Token =
    | NonbreakingToken
    | BreakingToken
    | StyleToken
    | NewlineToken
    | CarriageReturnToken
    | TabToken
    | AnsiToken;

/**
 * Text sequence that is not whitespace or a control sequence.
 */
export interface NonbreakingToken {
    kind: "nonbreaking";
    str: string;
    width: number;
}

/**
 * Non-tab non-newline whitespace sequence.
 */
export interface BreakingToken {
    kind: "breaking";
    str: string;
    width: number;
}

/**
 * A text styling sequence.
 */
export interface StyleToken {
    kind: "style";
    style: Style;
}

/**
 * Newline character.
 */
export interface NewlineToken {
    kind: "newline";
}

/**
 * Carriage return character.
 */
export interface CarriageReturnToken {
    kind: "carriage-return";
}

/**
 * Tab character.
 */
export interface TabToken {
    kind: "tab";
}

/**
 * Misc valid non-CSI (style) ANSI codes.  Currently we tokenize because we have to parse them anyway to skip, but
 * otherwise we ignore.
 */
export interface AnsiToken {
    kind: "ansi";
    sequence: string;
    newColumn?: number;
}
