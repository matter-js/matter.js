/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { p256 } from "@noble/curves/nist.js";
import { ECJPAKE_ID_CLIENT, EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";
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

describe("EcJpakeRound.parseRound1 (mbedTLS oracle)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("decodes mbedTLS cli_one into two valid key-pair-with-ZKP entries", () => {
        const round = EcJpakeRound.parseRound1(Bytes.of(Bytes.fromHex(vectors.cli_one)));
        const kp1X = Bytes.of(round.kp1.X);
        const kp1V = Bytes.of(round.kp1.zkp.V);
        expect(kp1X.length).to.equal(65);
        expect(kp1X[0]).to.equal(0x04);
        expect(kp1V.length).to.equal(65);
        expect(kp1V[0]).to.equal(0x04);
        expect(Bytes.of(round.kp1.zkp.r).length).to.be.within(1, 32);
        expect(Bytes.of(round.kp2.X).length).to.equal(65);
        expect(Bytes.of(round.kp2.zkp.V).length).to.equal(65);
    });

    it("kp1.X equals x1*G and kp2.X equals x2*G for the mbedTLS client side", () => {
        const round = EcJpakeRound.parseRound1(Bytes.of(Bytes.fromHex(vectors.cli_one)));
        const expectedX1 = Point.BASE.multiply(bigintFromHex(vectors.x1)).toBytes(false);
        const expectedX2 = Point.BASE.multiply(bigintFromHex(vectors.x2)).toBytes(false);
        expect(Bytes.toHex(round.kp1.X)).to.equal(Bytes.toHex(expectedX1));
        expect(Bytes.toHex(round.kp2.X)).to.equal(Bytes.toHex(expectedX2));
    });

    it("kp1.X equals x3*G and kp2.X equals x4*G for the mbedTLS server side", () => {
        const round = EcJpakeRound.parseRound1(Bytes.of(Bytes.fromHex(vectors.srv_one)));
        const expectedX3 = Point.BASE.multiply(bigintFromHex(vectors.x3)).toBytes(false);
        const expectedX4 = Point.BASE.multiply(bigintFromHex(vectors.x4)).toBytes(false);
        expect(Bytes.toHex(round.kp1.X)).to.equal(Bytes.toHex(expectedX3));
        expect(Bytes.toHex(round.kp2.X)).to.equal(Bytes.toHex(expectedX4));
    });

    it("rejects truncated input", () => {
        const truncated = Bytes.of(Bytes.fromHex(vectors.cli_one)).slice(0, 100);
        expect(() => EcJpakeRound.parseRound1(truncated)).to.throw();
    });

    it("rejects trailing bytes", () => {
        const padded = new Uint8Array([...Bytes.of(Bytes.fromHex(vectors.cli_one)), 0x00]);
        expect(() => EcJpakeRound.parseRound1(padded)).to.throw(/trailing/);
    });

    it("rejects an X point with wrong length byte (not 65 for P-256)", () => {
        const bytes = new Uint8Array(Bytes.of(Bytes.fromHex(vectors.cli_one)));
        bytes[0] = 33;
        expect(() => EcJpakeRound.parseRound1(bytes)).to.throw(/length/);
    });
});

describe("EcJpakeRound.serializeRound1 (byte-identical with mbedTLS oracle)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("re-serializes mbedTLS cli_one byte-identically (parse -> serialize == input)", () => {
        const original = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const round = EcJpakeRound.parseRound1(original);
        const reEncoded = EcJpakeRound.serializeRound1(round.kp1, round.kp2);
        expect(Bytes.toHex(reEncoded)).to.equal(vectors.cli_one);
    });

    it("re-serializes mbedTLS srv_one byte-identically (parse -> serialize == input)", () => {
        const original = Bytes.of(Bytes.fromHex(vectors.srv_one));
        const round = EcJpakeRound.parseRound1(original);
        const reEncoded = EcJpakeRound.serializeRound1(round.kp1, round.kp2);
        expect(Bytes.toHex(reEncoded)).to.equal(vectors.srv_one);
    });

    it("rejects writing a ZKP r that has a non-minimal leading zero", () => {
        const round = EcJpakeRound.parseRound1(Bytes.of(Bytes.fromHex(vectors.cli_one)));
        const padded = new Uint8Array([0x00, ...Bytes.of(round.kp1.zkp.r)]);
        const tampered = { X: round.kp1.X, zkp: { V: round.kp1.zkp.V, r: padded } };
        expect(() => EcJpakeRound.serializeRound1(tampered, round.kp2)).to.throw(/minimal/);
    });
});

describe("EcJpakeRound.parseRound1 defensive copies", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("returned X / zkp.V / zkp.r are independent of the input buffer", () => {
        const original = Bytes.of(Bytes.fromHex(vectors.cli_one));
        const input = new Uint8Array(original);
        const parsed = EcJpakeRound.parseRound1(input);
        const x1Snapshot = new Uint8Array(Bytes.of(parsed.kp1.X));
        const v1Snapshot = new Uint8Array(Bytes.of(parsed.kp1.zkp.V));
        const r1Snapshot = new Uint8Array(Bytes.of(parsed.kp1.zkp.r));
        const x2Snapshot = new Uint8Array(Bytes.of(parsed.kp2.X));
        input.fill(0xff);
        expect(Bytes.areEqual(parsed.kp1.X, x1Snapshot)).to.equal(true);
        expect(Bytes.areEqual(parsed.kp1.zkp.V, v1Snapshot)).to.equal(true);
        expect(Bytes.areEqual(parsed.kp1.zkp.r, r1Snapshot)).to.equal(true);
        expect(Bytes.areEqual(parsed.kp2.X, x2Snapshot)).to.equal(true);
    });
});

describe("EcJpakeRound.buildRound1 (deterministic ephemerals)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("produces a parseable, ZKP-valid round-1 for the client side", async () => {
        const x1 = bigintFromHex(vectors.x1);
        const x2 = bigintFromHex(vectors.x2);
        const v1 = (x1 ^ 0x5a5a5a5an) % N || 1n;
        const v2 = (x2 ^ 0xa5a5a5a5n) % N || 1n;
        const built = await EcJpakeRound.buildRound1(crypto, { x1, x2, v1, v2, id: ECJPAKE_ID_CLIENT });
        const wire = EcJpakeRound.serializeRound1(built.kp1, built.kp2);
        const round = EcJpakeRound.parseRound1(wire);
        expect(
            await SchnorrZkp.verify(crypto, { zkp: round.kp1.zkp, publicKey: round.kp1.X, id: ECJPAKE_ID_CLIENT }),
        ).to.equal(true);
        expect(
            await SchnorrZkp.verify(crypto, { zkp: round.kp2.zkp, publicKey: round.kp2.X, id: ECJPAKE_ID_CLIENT }),
        ).to.equal(true);
        const expectedX1 = Point.BASE.multiply(x1).toBytes(false);
        const expectedX2 = Point.BASE.multiply(x2).toBytes(false);
        expect(Bytes.toHex(round.kp1.X)).to.equal(Bytes.toHex(expectedX1));
        expect(Bytes.toHex(round.kp2.X)).to.equal(Bytes.toHex(expectedX2));
    });

    it("is fully deterministic: same inputs -> identical bytes", async () => {
        const args = {
            x1: bigintFromHex(vectors.x1),
            x2: bigintFromHex(vectors.x2),
            v1: bigintFromHex(vectors.x3),
            v2: bigintFromHex(vectors.x4),
            id: ECJPAKE_ID_CLIENT,
        };
        const a = await EcJpakeRound.buildRound1(crypto, args);
        const b = await EcJpakeRound.buildRound1(crypto, args);
        expect(Bytes.areEqual(a.kp1.X, b.kp1.X)).to.equal(true);
        expect(Bytes.areEqual(a.kp1.zkp.V, b.kp1.zkp.V)).to.equal(true);
        expect(Bytes.areEqual(a.kp1.zkp.r, b.kp1.zkp.r)).to.equal(true);
        expect(Bytes.areEqual(a.kp2.zkp.r, b.kp2.zkp.r)).to.equal(true);
    });
});
