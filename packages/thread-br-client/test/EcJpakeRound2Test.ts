/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { p256 } from "@noble/curves/nist.js";
import { ECJPAKE_ID_CLIENT, ECJPAKE_ID_SERVER, EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";
import { data as mbedtlsVectors } from "./fixtures/ecjpake/mbedtls-self-test-vectors.json.js";

const crypto = new StandardCrypto();

interface MbedTlsVectors {
    password: { hex: string };
    x1: string;
    x2: string;
    x3: string;
    x4: string;
    cli_one: string;
    srv_one: string;
    cli_two: string;
    srv_two: string;
}

function bigintFromHex(hex: string): bigint {
    return BigInt("0x" + hex);
}

const Point = p256.Point;
const N = Point.Fn.ORDER;

function pointBytes(scalar: bigint): Uint8Array {
    return Point.BASE.multiply(scalar).toBytes(false);
}

describe("EcJpakeRound.parseRound2 + verifyRound2Zkp (mbedTLS oracle)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("parses cli_two (no ECParameters prefix) into a single ECJPAKEKeyKP", () => {
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        const kpX = Bytes.of(kp.X);
        const kpV = Bytes.of(kp.zkp.V);
        expect(kpX.length).to.equal(65);
        expect(kpX[0]).to.equal(0x04);
        expect(kpV.length).to.equal(65);
        expect(kpV[0]).to.equal(0x04);
        expect(Bytes.of(kp.zkp.r).length).to.be.within(1, 32);
    });

    it("parses srv_two with ECParameters prefix (03 00 17)", () => {
        const bytes = Bytes.of(Bytes.fromHex(vectors.srv_two));
        expect(bytes[0]).to.equal(0x03);
        expect(bytes[1]).to.equal(0x00);
        expect(bytes[2]).to.equal(0x17);
        const kp = EcJpakeRound.parseRound2(bytes, { expectEcParameters: true });
        const kpX = Bytes.of(kp.X);
        expect(kpX.length).to.equal(65);
        expect(kpX[0]).to.equal(0x04);
    });

    it("rejects srv_two when expectEcParameters is false (header bytes parsed as kkp length)", () => {
        const bytes = Bytes.of(Bytes.fromHex(vectors.srv_two));
        expect(() => EcJpakeRound.parseRound2(bytes, { expectEcParameters: false })).to.throw();
    });

    it("rejects cli_two when expectEcParameters is true (no 03 00 17 prefix present)", () => {
        const bytes = Bytes.of(Bytes.fromHex(vectors.cli_two));
        expect(() => EcJpakeRound.parseRound2(bytes, { expectEcParameters: true })).to.throw(/ECParameters|secp256r1/);
    });

    it("verifies the cli_two ZKP under composite generator G' = X3 + X4 + X1 with id='client'", async () => {
        const Xp1 = pointBytes(bigintFromHex(vectors.x3));
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const Xm1 = pointBytes(bigintFromHex(vectors.x1));
        const generator = EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        expect(await EcJpakeRound.verifyRound2Zkp(crypto, { kp, generator, peerId: ECJPAKE_ID_CLIENT })).to.equal(true);
    });

    it("verifies the srv_two ZKP under composite generator G' = X1 + X2 + X3 with id='server'", async () => {
        const Xp1 = pointBytes(bigintFromHex(vectors.x1));
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const Xm1 = pointBytes(bigintFromHex(vectors.x3));
        const generator = EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        });
        expect(await EcJpakeRound.verifyRound2Zkp(crypto, { kp, generator, peerId: ECJPAKE_ID_SERVER })).to.equal(true);
    });

    it("rejects cli_two ZKP when verified with id='server'", async () => {
        const Xp1 = pointBytes(bigintFromHex(vectors.x3));
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const Xm1 = pointBytes(bigintFromHex(vectors.x1));
        const generator = EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        expect(await EcJpakeRound.verifyRound2Zkp(crypto, { kp, generator, peerId: ECJPAKE_ID_SERVER })).to.equal(
            false,
        );
    });

    it("rejects srv_two ZKP when the wrong generator (base point) is used", async () => {
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        });
        const baseG = { point: Point.BASE, bytes: Point.BASE.toBytes(false) };
        expect(
            await EcJpakeRound.verifyRound2Zkp(crypto, { kp, generator: baseG, peerId: ECJPAKE_ID_SERVER }),
        ).to.equal(false);
    });

    it("rejects trailing bytes on cli_two", () => {
        const padded = new Uint8Array([...Bytes.of(Bytes.fromHex(vectors.cli_two)), 0x00]);
        expect(() => EcJpakeRound.parseRound2(padded, { expectEcParameters: false })).to.throw(/trailing/);
    });
});

describe("EcJpakeRound.serializeRound2 (byte-identical round-trip with mbedTLS oracle)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("re-serialises cli_two byte-identically (parse -> serialize == input)", () => {
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        const reEncoded = EcJpakeRound.serializeRound2(kp, { prependEcParameters: false });
        expect(Bytes.toHex(reEncoded)).to.equal(vectors.cli_two);
    });

    it("re-serialises srv_two byte-identically (parse -> serialize == input)", () => {
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        });
        const reEncoded = EcJpakeRound.serializeRound2(kp, { prependEcParameters: true });
        expect(Bytes.toHex(reEncoded)).to.equal(vectors.srv_two);
    });
});

describe("EcJpakeRound.buildRound2 (deterministic ephemerals)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    function clientGenerator() {
        const Xp1 = pointBytes(bigintFromHex(vectors.x3));
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const Xm1 = pointBytes(bigintFromHex(vectors.x1));
        return EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
    }

    it("produces a parseable, ZKP-valid round-2 message for the client side", async () => {
        const generator = clientGenerator();
        const xm2 = bigintFromHex(vectors.x2);
        const s = bigintFromHex(vectors.password.hex);
        const v = (xm2 ^ 0xa5a5a5a5n) % N || 1n;
        const kp = await EcJpakeRound.buildRound2(crypto, { xm2, s, v, id: ECJPAKE_ID_CLIENT, generator });
        const wire = EcJpakeRound.serializeRound2(kp, { prependEcParameters: false });
        const parsed = EcJpakeRound.parseRound2(wire, { expectEcParameters: false });
        expect(
            await EcJpakeRound.verifyRound2Zkp(crypto, { kp: parsed, generator, peerId: ECJPAKE_ID_CLIENT }),
        ).to.equal(true);
        const expectedXm = generator.point.multiply((xm2 * s) % N).toBytes(false);
        expect(Bytes.toHex(parsed.X)).to.equal(Bytes.toHex(expectedXm));
    });

    it("rejects xm2 = 0 and xm2 >= n", async () => {
        const generator = clientGenerator();
        const s = bigintFromHex(vectors.password.hex);
        await expect(
            EcJpakeRound.buildRound2(crypto, { xm2: 0n, s, v: 1n, id: ECJPAKE_ID_CLIENT, generator }),
        ).to.be.rejectedWith(/xm2/);
        await expect(
            EcJpakeRound.buildRound2(crypto, { xm2: N, s, v: 1n, id: ECJPAKE_ID_CLIENT, generator }),
        ).to.be.rejectedWith(/xm2/);
    });

    it("rejects s = 0", async () => {
        const generator = clientGenerator();
        await expect(
            EcJpakeRound.buildRound2(crypto, { xm2: 1n, s: 0n, v: 1n, id: ECJPAKE_ID_CLIENT, generator }),
        ).to.be.rejectedWith(/s/);
    });

    it("is fully deterministic: same inputs -> identical bytes", async () => {
        const generator = clientGenerator();
        const args = {
            xm2: bigintFromHex(vectors.x2),
            s: bigintFromHex(vectors.password.hex),
            v: bigintFromHex(vectors.x4),
            id: ECJPAKE_ID_CLIENT,
            generator,
        };
        const a = await EcJpakeRound.buildRound2(crypto, args);
        const b = await EcJpakeRound.buildRound2(crypto, args);
        expect(Bytes.areEqual(a.X, b.X)).to.equal(true);
        expect(Bytes.areEqual(a.zkp.V, b.zkp.V)).to.equal(true);
        expect(Bytes.areEqual(a.zkp.r, b.zkp.r)).to.equal(true);
    });
});
