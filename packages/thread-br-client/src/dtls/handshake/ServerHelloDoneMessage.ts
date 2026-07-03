/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DtlsError } from "../channel/DtlsChannel.js";

/**
 * ServerHelloDone body parser (RFC 5246 §7.4.5). The body is empty; this
 * exists only so the state machine has a uniform per-message entry point and
 * a single place to fail loudly if a future BR ever sends payload bytes here.
 */
export const ServerHelloDoneMessage = {
    parse(body: Uint8Array): void {
        if (body.length !== 0) {
            throw new DtlsError(`ServerHelloDone body must be empty, got ${body.length} bytes`);
        }
    },
} as const;
