/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 record layer for `TLS_ECJPAKE_WITH_AES_128_CCM_8`. Internal to `dtls/`;
 * not re-exported from the package public API surface until the {@link DtlsSocket}
 * interface ships in sub-batch 5.
 */

export { AntiReplayWindow } from "./AntiReplayWindow.js";
export { ContentType, isContentType } from "./ContentType.js";
export { DtlsCipherState, type DtlsCipherStateInputs } from "./DtlsCipherState.js";
export {
    DTLS_1_2_VERSION,
    DTLS_AEAD_OVERHEAD,
    DTLS_HEADER_LEN,
    DTLS_MAX_FRAGMENT_LEN,
    DtlsRecord,
    type DtlsRecordCipherState,
    DtlsReplayError,
} from "./DtlsRecord.js";
// AesCcm8 is intentionally NOT exported — keep the AEAD primitive internal so the
// only path to it is through DtlsRecord.encode/decode under a DtlsCipherState.
