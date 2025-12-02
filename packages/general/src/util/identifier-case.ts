/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Make first character uppercase.
 */
export function capitalize<T extends string>(text: T) {
    return (text[0].toUpperCase() + text.slice(1)) as Capitalize<T>;
}

/**
 * Converts identifiers of the form "foo-bar", "foo_bar", "foo bar", "foo*bar",
 * "fooBar" or "FOOBar" into "fooBar" or "FooBar".
 */
export function camelize(name: string, upperFirst = false) {
    const pieces = new Array<string>();
    let pieceStart = 0,
        sawUpper = false,
        sawLower = false,
        i = 0;

    function addPiece(to: number) {
        if (pieceStart < to) pieces.push(name.slice(pieceStart, to));
        sawLower = sawUpper = false;
    }

    for (; i < name.length; i++) {
        if (name[i] >= "A" && name[i] <= "Z") {
            if (sawLower) {
                addPiece(i);
                pieceStart = i;
            }
            sawUpper = true;
            continue;
        }

        if (name[i] >= "a" && name[i] <= "z") {
            if (!sawLower) {
                if (sawUpper) {
                    addPiece(i - 1);
                    pieceStart = i - 1;
                }
            }
            sawLower = true;
            continue;
        }

        addPiece(i);

        if ((name[i] >= "0" && name[i] <= "9") || name[i] === "$") {
            pieces.push(name[i]);
        }

        pieceStart = i + 1;
        continue;
    }
    addPiece(i);

    let didFirst = false;
    let result = pieces
        .map(piece => {
            let firstChar = piece[0];
            if (upperFirst || didFirst) {
                firstChar = firstChar.toUpperCase();
            } else {
                firstChar = firstChar.toLowerCase();
                didFirst = true;
            }
            return `${firstChar}${piece.slice(1).toLowerCase()}`;
        })
        .join("");

    // Special case so "100ths" doesn't become "100Ths" which is formally correct but goofy
    result = result.replace(/(\d)Ths/i, "$1ths");

    return result;
}

/**
 * Converts an identifier from CamelCase to snake_case.
 */
export function decamelize(name: string, separator = "-") {
    const result = Array<string>();
    let needSeparator = false;
    for (const c of name) {
        if (c >= "A" && c <= "Z") {
            if (needSeparator) {
                result.push(separator);
                needSeparator = false;
            }
            result.push(c.toLowerCase());
        } else {
            result.push(c);
            needSeparator = true;
        }
    }
    return result.join("");
}
