/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 client-side handshake driver for `TLS_ECJPAKE_WITH_AES_128_CCM_8`.
 * Internal to `dtls/`; not re-exported from the package public API surface
 * until the {@link DtlsSocket} interface ships in sub-batch 5. The per-message
 * encoders/parsers (`ClientHelloMessage`, `ServerHelloMessage`, `HandshakeMessage`,
 * etc.) are deliberately kept private to this module.
 */

export { DtlsClient, type DtlsClientConfig, type DtlsClientState, type DtlsClientStep } from "./DtlsClient.js";
