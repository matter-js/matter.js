/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
import type { DtlsSocket } from "./DtlsSocket.js";

/**
 * Factory facade for DTLS 1.2 + EC-JPAKE clients. Implementations construct a
 * UDP-bound transport, run the handshake to "established", and resolve with a
 * {@link DtlsSocket}. Per the Phase 0c.6 decision memo, only the `noble`
 * backend ships in Phase 3; a `wasm-mbedtls` backend behind the same interface
 * is a fallback option that is not built unless real-BR interop fails.
 */
export interface DtlsBackend {
    /** Open a connection to the peer's DTLS endpoint. Resolves once the handshake completes. */
    connect(opts: DtlsConnectOpts): Promise<DtlsSocket>;
}
