/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 + EC-JPAKE socket layer — the only surface that escapes from `dtls/`
 * to the package public API. Handshake/record/PRF/EC-JPAKE internals stay
 * package-private.
 */

export { createDtlsBackend, type CreateDtlsBackendOpts, type DtlsBackendKind } from "./createDtlsBackend.js";
export type { DtlsBackend } from "./DtlsBackend.js";
export type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
export type { DtlsSocket } from "./DtlsSocket.js";
