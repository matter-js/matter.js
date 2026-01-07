/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export namespace screen {
    export namespace erase {
        // Erase to end of line
        export const toEol = "\x1b[K";

        // Move to start of line and erase
        export const line = `\r${toEol}`;
    }

    // Clear all lines
    export const clear = "\x1b[K";
}
