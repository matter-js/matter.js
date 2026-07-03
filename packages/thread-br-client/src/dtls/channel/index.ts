/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 + EC-JPAKE channel layer — the only surface that escapes from `dtls/`
 * to the package public API. Handshake/record/PRF/EC-JPAKE internals stay
 * package-private.
 */

export { connectDtls } from "./connectDtls.js";
export { DtlsError, type DtlsChannel } from "./DtlsChannel.js";
export type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
