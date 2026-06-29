/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { type EcJpakeKeyKP, EcJpakeRound } from "../ecjpake/EcJpakeRound.js";

/**
 * ServerKeyExchange body parser for `TLS_ECJPAKE_WITH_AES_128_CCM_8`
 * (mbedTLS `ssl_tls12_server.c:2467-2507`):
 *
 * ```
 * ECParameters curve_params         // 0x03 || 0x00 || 0x17  (named_curve, secp256r1)
 * ECJPAKEKeyKP server_round2        // 1 + 65 + 1 + 65 + 1 + |r| bytes
 * ```
 *
 * The 3-byte ECParameters header is *prepended by the TLS-binding layer*, not
 * by the EC-JPAKE module — see the architecture notes section 2 — so we
 * strip it here before handing the remainder to {@link EcJpakeRound.parseRound2}
 * with `expectEcParameters: false`.
 */

export const ServerKeyExchangeMessage = {
    parse(body: Uint8Array): EcJpakeKeyKP {
        // EcJpakeRound.parseRound2 already validates the 3-byte ECParameters prefix
        // and the ECJPAKEKeyKP body when `expectEcParameters` is true; deferring keeps
        // both error paths (bad prefix, bad body) consistent with round-1 parsers.
        return EcJpakeRound.parseRound2(body, { expectEcParameters: true });
    },
} as const;
