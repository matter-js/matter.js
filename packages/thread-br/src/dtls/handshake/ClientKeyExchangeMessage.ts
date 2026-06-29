/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { type EcJpakeKeyKP, EcJpakeRound } from "../ecjpake/EcJpakeRound.js";

/**
 * ClientKeyExchange body builder for `TLS_ECJPAKE_WITH_AES_128_CCM_8`
 * (mbedTLS `ssl_tls12_client.c:2618-2635`).
 *
 * Wire layout — `ECJPAKEKeyKP` only, no ECParameters prefix (the asymmetry
 * vs. ServerKeyExchange is documented in
 * `2026-04-29-thread-meshcop-dtls-architecture-notes.md` §2):
 *
 * ```
 * ECJPAKEKeyKP client_round2        // 1 + 65 + 1 + 65 + 1 + |r| bytes
 * ```
 */
export const ClientKeyExchangeMessage = {
    build(kp: EcJpakeKeyKP): Uint8Array {
        return EcJpakeRound.serializeRound2(kp, { prependEcParameters: false });
    },
} as const;
