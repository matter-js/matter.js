/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, InternalError } from "@matter/general";
import { p256 } from "@noble/curves/nist.js";
import { DtlsError } from "../channel/DtlsChannel.js";
import { SchnorrZkp, type SchnorrZkpGenerator } from "./SchnorrZkp.js";

/**
 * One half of an EC-JPAKE round-1 message: an ephemeral public key plus a Schnorr
 * proof of knowledge of its private scalar against the curve generator.
 *
 * Wire (mbedTLS v3.6.6 `ecjpake_kkp_write`):
 * ```
 * uint8 X_len; uint8 X[X_len];          // X_len = 65 for P-256 uncompressed
 * uint8 V_len; uint8 V[V_len];          // V_len = 65 for P-256 uncompressed
 * uint8 r_len; uint8 r[r_len];          // r_len is minimal, leading zeros stripped
 * ```
 */
export interface EcJpakeKeyKP {
    /** SEC1-uncompressed public key `X = x*G`. */
    X: Bytes;
    /** Schnorr ZKP proving knowledge of `x`. */
    zkp: SchnorrZkp;
}

const Point = p256.Point;
const N = Point.Fn.ORDER;
const POINT_LEN = 65;

/**
 * EC-JPAKE participant identifiers used in the ZKP challenge hash. These are the literal
 * byte strings from mbedTLS `ecjpake_id[]` (mbedtls v3.6.6 `library/ecjpake.c`); the wire
 * value is a hash input on both sides, so the strings must match between client and server.
 */
export const ECJPAKE_ID_CLIENT = "client";
export const ECJPAKE_ID_SERVER = "server";

function readU8(bytes: Uint8Array, offset: number): number {
    if (offset >= bytes.length) {
        throw new DtlsError(`unexpected end of buffer at offset ${offset}`);
    }
    return bytes[offset];
}

function readSlice(bytes: Uint8Array, offset: number, length: number): Uint8Array {
    if (offset + length > bytes.length) {
        throw new DtlsError(
            `buffer too short: need ${length} bytes at offset ${offset}, have ${bytes.length - offset}`,
        );
    }
    // slice (copy) so parse outputs own their bytes; callers can pass subarray views safely.
    return bytes.slice(offset, offset + length);
}

function validateKeyKP(keyKP: EcJpakeKeyKP): void {
    const X = Bytes.of(keyKP.X);
    const V = Bytes.of(keyKP.zkp.V);
    const r = Bytes.of(keyKP.zkp.r);
    if (X.length !== POINT_LEN || X[0] !== 0x04) {
        throw new InternalError("X must be SEC1-uncompressed P-256 (65 bytes, 0x04 prefix)");
    }
    if (V.length !== POINT_LEN || V[0] !== 0x04) {
        throw new InternalError("ZKP.V must be SEC1-uncompressed P-256 (65 bytes, 0x04 prefix)");
    }
    if (r.length === 0 || r.length > 255) {
        throw new InternalError(`ZKP.r length must be 1..255, got ${r.length}`);
    }
    // Minimal-encoding invariant: leading byte must be non-zero (except r === 0,
    // already excluded above). mbedTLS produces the minimal form via mbedtls_mpi_size,
    // so ours must too if we want byte-identical output.
    if (r[0] === 0x00) {
        throw new InternalError("ZKP.r must be minimal big-endian (no leading zero)");
    }
}

function keyKpEncodedLength(keyKP: EcJpakeKeyKP): number {
    return 1 + POINT_LEN + 1 + POINT_LEN + 1 + Bytes.of(keyKP.zkp.r).length;
}

function writeKeyKP(keyKP: EcJpakeKeyKP, out: Uint8Array, offset: number): number {
    const X = Bytes.of(keyKP.X);
    const V = Bytes.of(keyKP.zkp.V);
    const r = Bytes.of(keyKP.zkp.r);
    let p = offset;
    out[p++] = POINT_LEN;
    out.set(X, p);
    p += POINT_LEN;
    out[p++] = POINT_LEN;
    out.set(V, p);
    p += POINT_LEN;
    out[p++] = r.length;
    out.set(r, p);
    p += r.length;
    return p;
}

function readKeyKP(bytes: Uint8Array, offset: number): { kp: EcJpakeKeyKP; nextOffset: number } {
    let p = offset;
    const xLen = readU8(bytes, p);
    p += 1;
    if (xLen !== POINT_LEN) {
        throw new DtlsError(`expected P-256 point length ${POINT_LEN}, got ${xLen}`);
    }
    const X = readSlice(bytes, p, xLen);
    p += xLen;
    const vLen = readU8(bytes, p);
    p += 1;
    if (vLen !== POINT_LEN) {
        throw new DtlsError(`expected P-256 ZKP.V length ${POINT_LEN}, got ${vLen}`);
    }
    const V = readSlice(bytes, p, vLen);
    p += vLen;
    const rLen = readU8(bytes, p);
    p += 1;
    if (rLen === 0) {
        throw new DtlsError("ZKP.r length must be > 0");
    }
    const r = readSlice(bytes, p, rLen);
    p += rLen;

    return {
        kp: { X, zkp: { V, r } },
        nextOffset: p,
    };
}

/**
 * EC-JPAKE round 1 codec on top of the wire format that mbedTLS calls
 * `ECJPAKEKeyKPPairList`: two `ECJPAKEKeyKP` structures back-to-back, no separator,
 * no outer length (the carrying TLS extension layer adds the 2-byte length on the wire).
 *
 * Mirrors mbedTLS `ecjpake_kkpp_write` / `ecjpake_kkpp_read`.
 */
export const EcJpakeRound = {
    /**
     * Build a round-1 message for one role from two private scalars and two ephemeral
     * scalars (one ephemeral per ZKP). Caller-supplied ephemerals make the output
     * deterministic for testing — production callers must source them from a CSPRNG.
     *
     * `id` is `ECJPAKE_ID_CLIENT` for the joiner and `ECJPAKE_ID_SERVER` for the commissioner.
     */
    async buildRound1(
        crypto: Crypto,
        args: { x1: bigint; x2: bigint; v1: bigint; v2: bigint; id: string },
    ): Promise<{
        kp1: EcJpakeKeyKP;
        kp2: EcJpakeKeyKP;
    }> {
        const { x1, x2, v1, v2, id } = args;
        const X1 = Point.BASE.multiply(x1).toBytes(false);
        const X2 = Point.BASE.multiply(x2).toBytes(false);
        const zkp1 = await SchnorrZkp.generate(crypto, { privateKey: x1, publicKey: X1, ephemeral: v1, id });
        const zkp2 = await SchnorrZkp.generate(crypto, { privateKey: x2, publicKey: X2, ephemeral: v2, id });
        return {
            kp1: { X: X1, zkp: zkp1 },
            kp2: { X: X2, zkp: zkp2 },
        };
    },

    serializeRound1(kp1: EcJpakeKeyKP, kp2: EcJpakeKeyKP): Bytes {
        validateKeyKP(kp1);
        validateKeyKP(kp2);
        const out = new Uint8Array(keyKpEncodedLength(kp1) + keyKpEncodedLength(kp2));
        const after1 = writeKeyKP(kp1, out, 0);
        writeKeyKP(kp2, out, after1);
        return out;
    },

    parseRound1(bytes: Bytes): { kp1: EcJpakeKeyKP; kp2: EcJpakeKeyKP } {
        const buf = Bytes.of(bytes);
        const first = readKeyKP(buf, 0);
        const second = readKeyKP(buf, first.nextOffset);
        if (second.nextOffset !== buf.length) {
            throw new DtlsError(`trailing bytes after round-1 pair: ${buf.length - second.nextOffset} extra`);
        }
        return { kp1: first.kp, kp2: second.kp };
    },

    /**
     * Compute the round-2 composite generator `G' = Xp1 + Xp2 + Xm1` (mbedTLS
     * `ecjpake_kkpp_write_round_two` / `ecjpake_kkpp_read_round_two`).
     * Both sides use the same formula by symmetry — for the client `Xp1 = X3`,
     * `Xp2 = X4`, `Xm1 = X1`; for the server `Xp1 = X1`, `Xp2 = X2`, `Xm1 = X3`.
     */
    composeRound2Generator(args: { Xp1: Bytes; Xp2: Bytes; Xm1: Bytes }): SchnorrZkpGenerator {
        const Xp1 = Bytes.of(args.Xp1);
        const Xp2 = Bytes.of(args.Xp2);
        const Xm1 = Bytes.of(args.Xm1);
        const point = Point.fromBytes(Xp1).add(Point.fromBytes(Xp2)).add(Point.fromBytes(Xm1));
        if (point.is0()) {
            throw new DtlsError("round-2 generator G' must not be the point at infinity");
        }
        return { point, bytes: point.toBytes(false) };
    },

    /**
     * Build round 2 from the second private scalar `xm2`, the password (as the
     * mbedTLS-style big-endian integer `s`), the composite generator `G'`, and a
     * deterministic ephemeral `v`. Returns `Xm = (xm2 * s) * G'` plus a Schnorr
     * ZKP proving knowledge of `xm = xm2 * s mod n` against `G'`.
     *
     * Caller-supplied `v` makes output deterministic for testing; production
     * callers must source `v` from a CSPRNG.
     */
    async buildRound2(
        crypto: Crypto,
        args: { xm2: bigint; s: bigint; v: bigint; id: string; generator: SchnorrZkpGenerator },
    ): Promise<EcJpakeKeyKP> {
        const { xm2, s, v, id, generator } = args;
        if (xm2 <= 0n || xm2 >= N) {
            throw new InternalError("xm2 must be in [1, n-1]");
        }
        if (s <= 0n) {
            throw new InternalError("s (password as integer) must be positive");
        }
        const xm = (xm2 * s) % N;
        if (xm === 0n) {
            throw new InternalError("xm = xm2*s mod n must be non-zero");
        }
        const Xm = generator.point.multiply(xm);
        const XmBytes = Xm.toBytes(false);
        const zkp = await SchnorrZkp.generate(crypto, {
            privateKey: xm,
            publicKey: XmBytes,
            ephemeral: v,
            id,
            generator,
        });
        return { X: XmBytes, zkp };
    },

    /**
     * Serialise a round-2 message. When `prependEcParameters` is true the 3-byte
     * `ECParameters{ named_curve, secp256r1 }` header is emitted before the
     * `ECJPAKEKeyKP`. mbedTLS writes it inside `mbedtls_ecjpake_write_round_two`
     * when role=SERVER (consumed by `ssl_write_server_key_exchange`).
     * Server-side messages (ServerKeyExchange) use `true`; client-side
     * (ClientKeyExchange) uses `false`.
     */
    serializeRound2(kp: EcJpakeKeyKP, options: { prependEcParameters: boolean }): Bytes {
        validateKeyKP(kp);
        const headerLen = options.prependEcParameters ? 3 : 0;
        const out = new Uint8Array(headerLen + keyKpEncodedLength(kp));
        let p = 0;
        if (options.prependEcParameters) {
            out[p++] = 0x03;
            out[p++] = 0x00;
            out[p++] = 0x17;
        }
        writeKeyKP(kp, out, p);
        return out;
    },

    /**
     * Parse a round-2 message. `expectEcParameters` must be `true` when the parser
     * is the client reading ServerKeyExchange, and `false` when the parser is the
     * server reading ClientKeyExchange.
     */
    parseRound2(bytes: Bytes, options: { expectEcParameters: boolean }): EcJpakeKeyKP {
        const buf = Bytes.of(bytes);
        let p = 0;
        if (options.expectEcParameters) {
            if (buf.length < 3) {
                throw new DtlsError("round-2 message too short for ECParameters header");
            }
            if (buf[0] !== 0x03 || buf[1] !== 0x00 || buf[2] !== 0x17) {
                throw new DtlsError(
                    `expected ECParameters{named_curve, secp256r1} (03 00 17), got ${Array.from(buf.subarray(0, 3))
                        .map(b => b.toString(16).padStart(2, "0"))
                        .join(" ")}`,
                );
            }
            p = 3;
        }
        const { kp, nextOffset } = readKeyKP(buf, p);
        if (nextOffset !== buf.length) {
            throw new DtlsError(`trailing bytes after round-2 message: ${buf.length - nextOffset} extra`);
        }
        return kp;
    },

    /**
     * Verify the embedded round-2 ZKP under the supplied composite generator
     * and the peer's `id` ("client" or "server"). Returns `false` (does not throw)
     * on any verification failure — including malformed bytes — to mirror the
     * round-1 `SchnorrZkp.verify` contract.
     */
    async verifyRound2Zkp(
        crypto: Crypto,
        args: { kp: EcJpakeKeyKP; generator: SchnorrZkpGenerator; peerId: string },
    ): Promise<boolean> {
        const { kp, generator, peerId } = args;
        return await SchnorrZkp.verify(crypto, { zkp: kp.zkp, publicKey: kp.X, id: peerId, generator });
    },
} as const;
