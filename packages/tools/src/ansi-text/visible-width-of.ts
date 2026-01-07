/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Returns visible width of a space or visible text segment.
 */
export function visibleWidthOf(str: string) {
    let width = 0;

    for (let i = 0; i < str.length; i++) {
        const charCode = str.charCodeAt(i);

        // Skip zero width characters
        switch (charCode) {
            case 0x200b: // zwsp
            case 0x200c: // zero width non-joiner
            case 0x200d: // zero width joiner
            case 0x2060: // word joiner
            case 0xfeff: // bom
                continue;
        }

        // Extend width
        width++;

        // Skip low surrogate if it properly follows a high surrogate
        if (charCode >= 0xd800 && charCode < 0xdc00) {
            const charCode2 = str.charCodeAt(i + 1);
            if (charCode2 !== undefined && charCode2 >= 0xdc00 && charCode2 < 0xe000) {
                i++;
            }
        }
    }

    return width;
}
