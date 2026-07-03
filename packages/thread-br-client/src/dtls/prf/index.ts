/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TLS 1.2 PRF (P_SHA256) and SHA-256 handshake-transcript helpers used by the
 * DTLS 1.2 layer. Internal to `dtls/`; not re-exported from the package public
 * API surface until the {@link DtlsChannel} interface ships in sub-batch 5.
 */

export { HandshakeTranscript } from "./HandshakeTranscript.js";
export { TlsPrf } from "./TlsPrf.js";
