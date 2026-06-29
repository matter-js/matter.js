/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Schnorr zero-knowledge proof of knowledge of `x` such that `X = x*G`,
 * matching the EC-JPAKE wire shape used by mbedTLS v3.6.6 / draft-cragie-tls-ecjpake-01.
 *
 * Wire fields:
 * - `V`: ephemeral commitment point `v*G`, SEC1 uncompressed (`0x04 || X || Y`, 65 bytes for P-256).
 * - `r`: scalar response `v - h*x mod n`, minimal big-endian (leading zeros stripped).
 *
 * The `h` challenge is hashed over `len(G)||G || len(V)||V || len(X)||X || len(ID)||ID`,
 * each `len` a 4-byte big-endian integer (mbedTLS `ecjpake_hash`, ecjpake.c v3.6.6 §190-238).
 */
export interface SchnorrZkp {
    /** SEC1-uncompressed encoding of `V = v*G`. */
    V: Uint8Array;
    /** Minimal big-endian encoding of `r = v - h*x mod n`. */
    r: Uint8Array;
}

const Point = p256.Point;
const N = Point.Fn.ORDER;
const POINT_LEN = 65;

function be32(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value, false);
    return out;
}

function hashChallenge(args: {
    gBytes: Uint8Array;
    vBytes: Uint8Array;
    xBytes: Uint8Array;
    idBytes: Uint8Array;
}): bigint {
    const { gBytes, vBytes, xBytes, idBytes } = args;
    const total = 4 + gBytes.length + 4 + vBytes.length + 4 + xBytes.length + 4 + idBytes.length;
    const buf = new Uint8Array(total);
    let p = 0;
    buf.set(be32(gBytes.length), p);
    p += 4;
    buf.set(gBytes, p);
    p += gBytes.length;
    buf.set(be32(vBytes.length), p);
    p += 4;
    buf.set(vBytes, p);
    p += vBytes.length;
    buf.set(be32(xBytes.length), p);
    p += 4;
    buf.set(xBytes, p);
    p += xBytes.length;
    buf.set(be32(idBytes.length), p);
    p += 4;
    buf.set(idBytes, p);

    const digest = sha256(buf);
    let h = 0n;
    for (const byte of digest) {
        h = (h << 8n) | BigInt(byte);
    }
    return h % N;
}

function bigintToMinimalBE(value: bigint): Uint8Array {
    if (value < 0n) {
        throw new Error("Schnorr response scalar must be non-negative");
    }
    if (value === 0n) {
        return new Uint8Array(0);
    }
    const tmp = new Array<number>();
    let v = value;
    while (v > 0n) {
        tmp.push(Number(v & 0xffn));
        v >>= 8n;
    }
    return Uint8Array.from(tmp.reverse());
}

function bigintFromBE(bytes: Uint8Array): bigint {
    let v = 0n;
    for (const byte of bytes) {
        v = (v << 8n) | BigInt(byte);
    }
    return v;
}

function getBaseGBytes(): Uint8Array {
    return Point.BASE.toBytes(false);
}

function pointFromBytes(bytes: Uint8Array): InstanceType<typeof Point> {
    if (bytes.length !== POINT_LEN || bytes[0] !== 0x04) {
        throw new Error(
            `expected SEC1-uncompressed P-256 point (65 bytes, 0x04 prefix), got len=${bytes.length} head=${bytes[0]}`,
        );
    }
    return Point.fromBytes(bytes);
}

/**
 * Optional generator override. When omitted the curve base point `G` is used,
 * matching round-1 ZKPs. Round 2 passes a composite point (e.g. `X1 + X2 + X3`)
 * and must supply both `point` (for arithmetic) and `bytes` (for the hash
 * preimage, since mbedTLS hashes the SEC1-uncompressed encoding verbatim).
 */
export interface SchnorrZkpGenerator {
    point: InstanceType<typeof Point>;
    bytes: Uint8Array;
}

function generatorOrBase(g?: SchnorrZkpGenerator): SchnorrZkpGenerator {
    if (g) {
        if (g.bytes.length !== POINT_LEN || g.bytes[0] !== 0x04) {
            throw new Error("generator bytes must be SEC1-uncompressed P-256 (65 bytes, 0x04 prefix)");
        }
        return g;
    }
    return { point: Point.BASE, bytes: getBaseGBytes() };
}

export const SchnorrZkp = {
    /**
     * Generate a Schnorr ZKP for `(x, X = x*G)`. `G` defaults to the curve generator;
     * pass `generator` for the round-2 composite-generator case.
     *
     * The caller must supply both `x` and the SEC1 encoding of `X` to keep the call site
     * identical to the verification path (no implicit recomputation).
     *
     * `ephemeral` is the per-proof scalar `v`; in production it must be sampled
     * uniformly from `[1, n-1]`. Tests pass a fixed value so the proof is deterministic.
     */
    generate(args: {
        privateKey: bigint;
        publicKey: Uint8Array;
        ephemeral: bigint;
        id: string;
        generator?: SchnorrZkpGenerator;
    }): SchnorrZkp {
        const { privateKey, publicKey, ephemeral, id } = args;
        if (ephemeral <= 0n || ephemeral >= N) {
            throw new Error("ephemeral scalar must be in [1, n-1]");
        }
        if (privateKey <= 0n || privateKey >= N) {
            throw new Error("private key scalar must be in [1, n-1]");
        }
        const g = generatorOrBase(args.generator);
        const V = g.point.multiply(ephemeral);
        const vBytes = V.toBytes(false);
        const idBytes = new TextEncoder().encode(id);
        const h = hashChallenge({ gBytes: g.bytes, vBytes, xBytes: publicKey, idBytes });
        // r = v - h*x mod n, matching mbedTLS ecjpake_zkp_write.
        const rBig = (((ephemeral - ((h * privateKey) % N)) % N) + N) % N;
        return { V: vBytes, r: bigintToMinimalBE(rBig) };
    },

    verify(args: { zkp: SchnorrZkp; publicKey: Uint8Array; id: string; generator?: SchnorrZkpGenerator }): boolean {
        const { zkp, publicKey, id } = args;
        const idBytes = new TextEncoder().encode(id);
        let g: SchnorrZkpGenerator;
        let V;
        let X;
        try {
            g = generatorOrBase(args.generator);
            V = pointFromBytes(zkp.V);
            X = pointFromBytes(publicKey);
        } catch {
            return false;
        }
        if (V.is0() || X.is0()) {
            return false;
        }
        const r = bigintFromBE(zkp.r);
        if (r >= N) {
            return false;
        }
        const h = hashChallenge({ gBytes: g.bytes, vBytes: zkp.V, xBytes: publicKey, idBytes });
        // mbedTLS ecjpake_zkp_verify computes V' = r*G + h*X via ecp_muladd. multiplyUnsafe is
        // safe here: r is on the wire (peer-supplied) and h is a hash digest; neither is secret.
        const lhs = g.point.multiplyUnsafe(r).add(X.multiplyUnsafe(h));
        return lhs.equals(V);
    },
} as const;
