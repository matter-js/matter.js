/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";

const Point = p256.Point;
const N = Point.Fn.ORDER;
const COORDINATE_BYTES = 32;

/**
 * EC-JPAKE premaster-secret derivation, mirroring mbedTLS v3.6.6
 * `mbedtls_ecjpake_derive_secret` and its helper `mbedtls_ecjpake_derive_k`.
 *
 * Given the agreed pieces from a completed round-2 exchange:
 *
 * ```
 * K   = ( Xp - Xp2 * (xm2 * s mod n) ) * xm2
 * PMS = SHA-256( K.X as 32-byte BE )
 * ```
 *
 * - `Xp` is the peer's round-2 public point (parsed from `parseRound2`).
 * - `Xp2` is the peer's *second* round-1 public point.
 * - `xm2` is our second round-1 private scalar.
 * - `s` is the EC-JPAKE password as the big-endian integer of its bytes,
 *   matching `mbedtls_mpi_read_binary` in `mbedtls_ecjpake_setup`.
 *
 * The PMS is exactly the SHA-256 hash of the field-element-sized big-endian
 * encoding of `K.X` — no IDs, no transcript, no nonces. From here the standard
 * TLS 1.2 PRF takes over (Phase 0c.5 / DTLS layer).
 */
export const EcJpakePms = {
    derive(args: { Xp: Uint8Array; Xp2: Uint8Array; xm2: bigint; s: bigint }): Uint8Array {
        const { Xp, Xp2, xm2, s } = args;
        if (xm2 <= 0n || xm2 >= N) {
            throw new Error("xm2 must be in [1, n-1]");
        }
        if (s <= 0n) {
            throw new Error("s (password as integer) must be positive");
        }
        const Xp_pt = Point.fromBytes(Xp);
        const Xp2_pt = Point.fromBytes(Xp2);
        if (Xp_pt.is0() || Xp2_pt.is0()) {
            throw new Error("peer points must not be the point at infinity");
        }
        const xm2sNeg = (N - ((xm2 * s) % N)) % N;
        // xm2sNeg is derived from the password; multiply (constant-time) avoids leaking it via timing.
        const K1 = Xp_pt.add(Xp2_pt.multiply(xm2sNeg));
        const K = K1.multiply(xm2);
        if (K.is0()) {
            throw new Error("derived K is the point at infinity");
        }
        // mbedTLS writes K.X as a fixed-width 32-byte BE field element before
        // SHA-256. SEC1-uncompressed encoding from noble lays out as
        // 0x04 || X(32) || Y(32) — slice X out at offset 1.
        const sec1 = K.toBytes(false);
        const xBytes = sec1.subarray(1, 1 + COORDINATE_BYTES);
        return sha256(xBytes);
    },
} as const;
