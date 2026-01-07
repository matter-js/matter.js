/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export function TextDiff(actual: string, expected: string) {
    if (TextDiff.generator) {
        return TextDiff.generator(actual, expected);
    }
    return "(no diff generator installed)";
}

export namespace TextDiff {
    export let generator: undefined | ((actual: string, expected: string) => string);
}
