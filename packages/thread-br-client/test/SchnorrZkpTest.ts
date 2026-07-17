/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StandardCrypto } from "@matter/general";
import { p256 } from "@noble/curves/nist.js";
import { ECJPAKE_ID_CLIENT, ECJPAKE_ID_SERVER } from "../src/dtls/ecjpake/EcJpakeRound.js";
import { SchnorrZkp } from "../src/dtls/ecjpake/SchnorrZkp.js";
import { data as mbedtlsVectors } from "./fixtures/ecjpake/mbedtls-self-test-vectors.json.js";

const crypto = new StandardCrypto();

interface MbedTlsVectors {
    x1: string;
    x2: string;
    x3: string;
    x4: string;
    cli_one: string;
    srv_one: string;
}

function bigintFromHex(hex: string): bigint {
    return BigInt("0x" + hex);
}

const Point = p256.Point;
const N = Point.Fn.ORDER;

// Extract one ECJPAKEKeyKP entry from a wire buffer at the given offset, returning the
// raw fields needed to drive SchnorrZkp.verify. Mirrors the mbedTLS framing
// (uint8 X_len; X[X_len]; uint8 V_len; V[V_len]; uint8 r_len; r[r_len]) without
// pulling in the full EcJpakeRound parser, so this test exercises SchnorrZkp in
// isolation.
function sliceKkp(
    buf: Uint8Array,
    offset: number,
): { X: Uint8Array; V: Uint8Array; r: Uint8Array; nextOffset: number } {
    let p = offset;
    const xLen = buf[p++];
    const X = buf.subarray(p, p + xLen);
    p += xLen;
    const vLen = buf[p++];
    const V = buf.subarray(p, p + vLen);
    p += vLen;
    const rLen = buf[p++];
    const r = buf.subarray(p, p + rLen);
    p += rLen;
    return { X: new Uint8Array(X), V: new Uint8Array(V), r: new Uint8Array(r), nextOffset: p };
}

describe("SchnorrZkp.verify (mbedTLS oracle)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("accepts both ZKPs in mbedTLS cli_one (id='client')", async () => {
        const buf = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const first = sliceKkp(buf, 0);
        const second = sliceKkp(buf, first.nextOffset);
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: first.V, r: first.r },
                publicKey: first.X,
                id: ECJPAKE_ID_CLIENT,
            }),
        ).to.equal(true);
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: second.V, r: second.r },
                publicKey: second.X,
                id: ECJPAKE_ID_CLIENT,
            }),
        ).to.equal(true);
    });

    it("accepts both ZKPs in mbedTLS srv_one (id='server')", async () => {
        const buf = Bytes.of(Bytes.fromHex(vectors.srv_one));
        const first = sliceKkp(buf, 0);
        const second = sliceKkp(buf, first.nextOffset);
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: first.V, r: first.r },
                publicKey: first.X,
                id: ECJPAKE_ID_SERVER,
            }),
        ).to.equal(true);
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: second.V, r: second.r },
                publicKey: second.X,
                id: ECJPAKE_ID_SERVER,
            }),
        ).to.equal(true);
    });

    it("rejects a cli_one ZKP when verified with id='server'", async () => {
        const buf = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const first = sliceKkp(buf, 0);
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: first.V, r: first.r },
                publicKey: first.X,
                id: ECJPAKE_ID_SERVER,
            }),
        ).to.equal(false);
    });

    it("rejects when r is mutated (last byte flipped)", async () => {
        const buf = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const first = sliceKkp(buf, 0);
        const tampered = new Uint8Array(first.r);
        tampered[tampered.length - 1] ^= 0x01;
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: first.V, r: tampered },
                publicKey: first.X,
                id: ECJPAKE_ID_CLIENT,
            }),
        ).to.equal(false);
    });

    it("rejects when V is mutated to a different on-curve point", async () => {
        const buf = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const first = sliceKkp(buf, 0);
        // Use 2*V as a substitute (still a valid curve point but breaks the proof equation).
        const Vpoint = Point.fromBytes(first.V).double();
        const tamperedV = Vpoint.toBytes(false);
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: tamperedV, r: first.r },
                publicKey: first.X,
                id: ECJPAKE_ID_CLIENT,
            }),
        ).to.equal(false);
    });

    it("rejects an off-curve V (last byte mutated, almost surely off-curve)", async () => {
        const buf = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const first = sliceKkp(buf, 0);
        const tamperedV = new Uint8Array(first.V);
        tamperedV[tamperedV.length - 1] ^= 0x01;
        // Whether the mutation lands off-curve or just breaks the proof, verify must say false (and not throw).
        await expect(
            SchnorrZkp.verify(crypto, { zkp: { V: tamperedV, r: first.r }, publicKey: first.X, id: ECJPAKE_ID_CLIENT }),
        ).to.not.be.rejected;
        expect(
            await SchnorrZkp.verify(crypto, {
                zkp: { V: tamperedV, r: first.r },
                publicKey: first.X,
                id: ECJPAKE_ID_CLIENT,
            }),
        ).to.equal(false);
    });
});

describe("SchnorrZkp.generate -> verify round-trip", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("produces a verifiable ZKP for known fixed scalars (id='client')", async () => {
        const x = bigintFromHex(vectors.x1);
        const v = bigintFromHex(vectors.x2);
        const X = Point.BASE.multiply(x).toBytes(false);
        const zkp = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_CLIENT,
        });
        expect(await SchnorrZkp.verify(crypto, { zkp, publicKey: X, id: ECJPAKE_ID_CLIENT })).to.equal(true);
    });

    it("emits r in minimal big-endian (no leading zero) for a 32-byte case", async () => {
        const x = bigintFromHex(vectors.x1);
        const v = bigintFromHex(vectors.x2);
        const X = Point.BASE.multiply(x).toBytes(false);
        const zkp = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_CLIENT,
        });
        const r = Bytes.of(zkp.r);
        expect(r.length).to.be.within(1, 32);
        expect(r[0]).to.not.equal(0x00);
    });

    it("strips leading zero(s) when r happens to be < 2^248 (variable r-length)", async () => {
        // Iterate ephemerals deterministically until r turns out shorter than 32 bytes,
        // exercising the minimal-encoding branch that mbedTLS implements via mbedtls_mpi_size.
        const x = bigintFromHex(vectors.x1);
        const X = Point.BASE.multiply(x).toBytes(false);
        let v = 1n;
        let zkp: Awaited<ReturnType<typeof SchnorrZkp.generate>> | undefined;
        for (let i = 0; i < 4096; i++) {
            v = (v + 1n) % N;
            if (v === 0n) continue;
            const candidate = await SchnorrZkp.generate(crypto, {
                privateKey: x,
                publicKey: X,
                ephemeral: v,
                id: ECJPAKE_ID_CLIENT,
            });
            if (Bytes.of(candidate.r).length < 32) {
                zkp = candidate;
                break;
            }
        }
        expect(zkp, "must find an ephemeral producing r < 32 bytes within 4096 attempts").to.exist;
        expect(Bytes.of(zkp!.r)[0]).to.not.equal(0x00);
        expect(await SchnorrZkp.verify(crypto, { zkp: zkp!, publicKey: X, id: ECJPAKE_ID_CLIENT })).to.equal(true);
    });

    it("rejects ephemeral=0 and ephemeral>=n", async () => {
        const x = bigintFromHex(vectors.x1);
        const X = Point.BASE.multiply(x).toBytes(false);
        await expect(
            SchnorrZkp.generate(crypto, { privateKey: x, publicKey: X, ephemeral: 0n, id: ECJPAKE_ID_CLIENT }),
        ).to.be.rejectedWith(/ephemeral/);
        await expect(
            SchnorrZkp.generate(crypto, { privateKey: x, publicKey: X, ephemeral: N, id: ECJPAKE_ID_CLIENT }),
        ).to.be.rejectedWith(/ephemeral/);
    });

    it("rejects privateKey=0 and privateKey>=n", async () => {
        const X = Point.BASE.toBytes(false);
        await expect(
            SchnorrZkp.generate(crypto, { privateKey: 0n, publicKey: X, ephemeral: 1n, id: ECJPAKE_ID_CLIENT }),
        ).to.be.rejectedWith(/private key/);
        await expect(
            SchnorrZkp.generate(crypto, { privateKey: N, publicKey: X, ephemeral: 1n, id: ECJPAKE_ID_CLIENT }),
        ).to.be.rejectedWith(/private key/);
    });

    it("is deterministic: same inputs -> identical (V, r)", async () => {
        const x = bigintFromHex(vectors.x1);
        const v = bigintFromHex(vectors.x2);
        const X = Point.BASE.multiply(x).toBytes(false);
        const a = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_CLIENT,
        });
        const b = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_CLIENT,
        });
        expect(Bytes.areEqual(a.V, b.V)).to.equal(true);
        expect(Bytes.areEqual(a.r, b.r)).to.equal(true);
    });
});

describe("SchnorrZkp custom generator (round-2 prep)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    function makeCompositeGenerator() {
        // G' = (x1*G) + (x2*G) + (x3*G), the same shape mbedTLS uses for round 2.
        const X1 = Point.BASE.multiply(bigintFromHex(vectors.x1));
        const X2 = Point.BASE.multiply(bigintFromHex(vectors.x2));
        const X3 = Point.BASE.multiply(bigintFromHex(vectors.x3));
        const point = X1.add(X2).add(X3);
        return { point, bytes: point.toBytes(false) };
    }

    it("generate -> verify round-trips against a composite generator", async () => {
        const g = makeCompositeGenerator();
        const x = bigintFromHex(vectors.x4);
        const v = bigintFromHex(vectors.x1);
        const X = g.point.multiply(x).toBytes(false);
        const zkp = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_SERVER,
            generator: g,
        });
        expect(await SchnorrZkp.verify(crypto, { zkp, publicKey: X, id: ECJPAKE_ID_SERVER, generator: g })).to.equal(
            true,
        );
    });

    it("verify rejects when the verifier uses the base generator instead of the composite", async () => {
        const g = makeCompositeGenerator();
        const x = bigintFromHex(vectors.x4);
        const v = bigintFromHex(vectors.x1);
        const X = g.point.multiply(x).toBytes(false);
        const zkp = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_SERVER,
            generator: g,
        });
        expect(await SchnorrZkp.verify(crypto, { zkp, publicKey: X, id: ECJPAKE_ID_SERVER })).to.equal(false);
    });

    it("verify rejects when the prover uses the base generator but verifier uses composite", async () => {
        const g = makeCompositeGenerator();
        const x = bigintFromHex(vectors.x4);
        const v = bigintFromHex(vectors.x1);
        const X = Point.BASE.multiply(x).toBytes(false);
        const zkp = await SchnorrZkp.generate(crypto, {
            privateKey: x,
            publicKey: X,
            ephemeral: v,
            id: ECJPAKE_ID_SERVER,
        });
        expect(await SchnorrZkp.verify(crypto, { zkp, publicKey: X, id: ECJPAKE_ID_SERVER, generator: g })).to.equal(
            false,
        );
    });

    it("rejects malformed generator bytes", async () => {
        const g = makeCompositeGenerator();
        const x = bigintFromHex(vectors.x4);
        const v = bigintFromHex(vectors.x1);
        const X = g.point.multiply(x).toBytes(false);
        const bad = { point: g.point, bytes: g.bytes.slice(0, 64) };
        await expect(
            SchnorrZkp.generate(crypto, {
                privateKey: x,
                publicKey: X,
                ephemeral: v,
                id: ECJPAKE_ID_SERVER,
                generator: bad,
            }),
        ).to.be.rejectedWith(/generator/);
    });
});
