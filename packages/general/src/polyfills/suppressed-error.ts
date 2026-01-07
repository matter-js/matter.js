/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

if (globalThis.SuppressedError === undefined) {
    /**
     * Polyfill for ES SuppressedError which is widely supported but only available in Node.js as of version 24.
     */
    class SuppressedError extends Error {
        error: any;
        suppressed: any;

        constructor(error: any, suppressed: any, message?: string) {
            super(message);

            this.error = error;
            this.suppressed = suppressed;
        }
    }

    const factory = (error: any, suppressed: any, message?: string) => new SuppressedError(error, suppressed, message);
    factory.prototype = SuppressedError.prototype;

    globalThis.SuppressedError = factory as typeof globalThis.SuppressedError;
}
