/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Production EC-JPAKE crypto core (P-256 / draft-cragie-tls-ecjpake-01, mbedTLS-compatible).
 *
 * Hardening applied (Phase 3 sub-batch 1):
 * - Constant-time scalar multiplication on password-derived secrets (`EcJpakePms.derive`
 *   uses `Point.multiply`; `SchnorrZkp.verify` keeps `multiplyUnsafe` only on peer-supplied
 *   `r` and the hash digest `h`, neither of which is secret).
 * - Single pre-sized `Uint8Array` allocation in `EcJpakeRound.serializeRound1` /
 *   `serializeRound2` (replaces ~330 `Array.push` calls per round-1 message).
 * - Defensive copies on parse outputs: `EcJpakeRound.parseRound1` / `parseRound2` slice
 *   the input so returned `Uint8Array`s own their backing buffer.
 * - Hoisted participant identifiers `ECJPAKE_ID_CLIENT` / `ECJPAKE_ID_SERVER`.
 *
 * Constant-time guarantees rest on noble's `Point.multiply` implementation; if upstream
 * drops that property, revisit `EcJpakePms.derive`.
 *
 * Internal to `dtls/`; not re-exported from the package public API surface.
 */

export type { EcJpakeKeyKP } from "./EcJpakeRound.js";
export { ECJPAKE_ID_CLIENT, ECJPAKE_ID_SERVER, EcJpakeRound } from "./EcJpakeRound.js";
export type { SchnorrZkp as SchnorrZkpType } from "./SchnorrZkp.js";
export { SchnorrZkp } from "./SchnorrZkp.js";
