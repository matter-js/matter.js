/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ServerHelloDone body parser (RFC 5246 §7.4.5). The body is empty; this
 * exists only so the state machine has a uniform per-message entry point and
 * a single place to fail loudly if a future BR ever sends payload bytes here.
 */
export const ServerHelloDoneMessage = {
    parse(body: Uint8Array): void {
        if (body.length !== 0) {
            throw new Error(`ServerHelloDone body must be empty, got ${body.length} bytes`);
        }
    },
} as const;
