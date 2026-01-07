/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export namespace Chars {
    export const breakingSpace = new Set([
        " ", // Space
        "\u1680", // Ask the Irish
        "\u200b", // Zero-width space
        "\u2000",
        "\u2001",
        "\u2002",
        "\u2003",
        "\u2004",
        "\u2005",
        "\u2006",
        "\u2007",
        "\u2008",
        "\u2009",
        "\u200a",
        "\u205f", // Math space
        "\u3000", // Ideographic space
    ]);

    // eslint-disable-next-line no-misleading-character-class
    export const zeroWidth = /[\u200b\u200c\u200d\u2060\p{Mn}\p{Me}]/u;

    export const nonbreakingText = /[\u00a0\u202f\p{Letter}\p{Mark}\p{Sm}\p{Sc}\p{Sk}\p{So}\p{Number}\p{Punctuation}]/u;
}
