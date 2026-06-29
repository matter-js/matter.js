/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DtlsBackend } from "./DtlsBackend.js";
import type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
import type { DtlsSocket } from "./DtlsSocket.js";
import { NobleDtlsSocket } from "./NobleDtlsSocket.js";

/**
 * Default DTLS backend (Phase 3 sub-batch 5). Constructs a {@link NobleDtlsSocket}
 * and runs its handshake; resolves to the connected socket. The fallback
 * `wasm-mbedtls` backend is not built (Phase 0c.6 decision memo) — see
 * {@link createDtlsBackend} for the dispatch error.
 */
export class NobleDtlsBackend implements DtlsBackend {
    async connect(opts: DtlsConnectOpts): Promise<DtlsSocket> {
        const socket = new NobleDtlsSocket(opts);
        try {
            await socket.connect();
        } catch (e) {
            // Ensure we don't leak the dgram socket if the handshake fails.
            await socket.close().catch(() => {});
            throw e;
        }
        return socket;
    }
}
