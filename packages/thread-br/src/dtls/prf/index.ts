/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TLS 1.2 PRF (P_SHA256) and SHA-256 handshake-transcript helpers used by the
 * DTLS 1.2 layer. Internal to `dtls/`; not re-exported from the package public
 * API surface until the {@link DtlsSocket} interface ships in sub-batch 5.
 */

export { HandshakeTranscript } from "./HandshakeTranscript.js";
export { TlsPrf } from "./TlsPrf.js";
