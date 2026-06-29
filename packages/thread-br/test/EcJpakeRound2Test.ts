/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { p256 } from "@noble/curves/nist.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ECJPAKE_ID_CLIENT, ECJPAKE_ID_SERVER, EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = resolve(PACKAGE_ROOT, "test/fixtures/ecjpake/mbedtls-self-test-vectors.json");

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

function loadVectors(): MbedTlsVectors {
    return JSON.parse(readFileSync(FIXTURE, "utf8")) as MbedTlsVectors;
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
    const vectors = loadVectors();

    it("parses cli_two (no ECParameters prefix) into a single ECJPAKEKeyKP", () => {
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        expect(kp.X.length).to.equal(65);
        expect(kp.X[0]).to.equal(0x04);
        expect(kp.zkp.V.length).to.equal(65);
        expect(kp.zkp.V[0]).to.equal(0x04);
        expect(kp.zkp.r.length).to.be.within(1, 32);
    });

    it("parses srv_two with ECParameters prefix (03 00 17)", () => {
        const bytes = Bytes.of(Bytes.fromHex(vectors.srv_two));
        expect(bytes[0]).to.equal(0x03);
        expect(bytes[1]).to.equal(0x00);
        expect(bytes[2]).to.equal(0x17);
        const kp = EcJpakeRound.parseRound2(bytes, { expectEcParameters: true });
        expect(kp.X.length).to.equal(65);
        expect(kp.X[0]).to.equal(0x04);
    });

    it("rejects srv_two when expectEcParameters is false (header bytes parsed as kkp length)", () => {
        const bytes = Bytes.of(Bytes.fromHex(vectors.srv_two));
        expect(() => EcJpakeRound.parseRound2(bytes, { expectEcParameters: false })).to.throw();
    });

    it("rejects cli_two when expectEcParameters is true (no 03 00 17 prefix present)", () => {
        const bytes = Bytes.of(Bytes.fromHex(vectors.cli_two));
        expect(() => EcJpakeRound.parseRound2(bytes, { expectEcParameters: true })).to.throw(/ECParameters|secp256r1/);
    });

    it("verifies the cli_two ZKP under composite generator G' = X3 + X4 + X1 with id='client'", () => {
        const Xp1 = pointBytes(bigintFromHex(vectors.x3));
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const Xm1 = pointBytes(bigintFromHex(vectors.x1));
        const generator = EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        expect(EcJpakeRound.verifyRound2Zkp({ kp, generator, peerId: ECJPAKE_ID_CLIENT })).to.equal(true);
    });

    it("verifies the srv_two ZKP under composite generator G' = X1 + X2 + X3 with id='server'", () => {
        const Xp1 = pointBytes(bigintFromHex(vectors.x1));
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const Xm1 = pointBytes(bigintFromHex(vectors.x3));
        const generator = EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        });
        expect(EcJpakeRound.verifyRound2Zkp({ kp, generator, peerId: ECJPAKE_ID_SERVER })).to.equal(true);
    });

    it("rejects cli_two ZKP when verified with id='server'", () => {
        const Xp1 = pointBytes(bigintFromHex(vectors.x3));
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const Xm1 = pointBytes(bigintFromHex(vectors.x1));
        const generator = EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        });
        expect(EcJpakeRound.verifyRound2Zkp({ kp, generator, peerId: ECJPAKE_ID_SERVER })).to.equal(false);
    });

    it("rejects srv_two ZKP when the wrong generator (base point) is used", () => {
        const kp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        });
        const baseG = { point: Point.BASE, bytes: Point.BASE.toBytes(false) };
        expect(EcJpakeRound.verifyRound2Zkp({ kp, generator: baseG, peerId: ECJPAKE_ID_SERVER })).to.equal(false);
    });

    it("rejects trailing bytes on cli_two", () => {
        const padded = new Uint8Array([...Bytes.of(Bytes.fromHex(vectors.cli_two)), 0x00]);
        expect(() => EcJpakeRound.parseRound2(padded, { expectEcParameters: false })).to.throw(/trailing/);
    });
});

describe("EcJpakeRound.serializeRound2 (byte-identical round-trip with mbedTLS oracle)", () => {
    const vectors = loadVectors();

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
    const vectors = loadVectors();

    function clientGenerator() {
        const Xp1 = pointBytes(bigintFromHex(vectors.x3));
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const Xm1 = pointBytes(bigintFromHex(vectors.x1));
        return EcJpakeRound.composeRound2Generator({ Xp1, Xp2, Xm1 });
    }

    it("produces a parseable, ZKP-valid round-2 message for the client side", () => {
        const generator = clientGenerator();
        const xm2 = bigintFromHex(vectors.x2);
        const s = bigintFromHex(vectors.password.hex);
        const v = (xm2 ^ 0xa5a5a5a5n) % N || 1n;
        const kp = EcJpakeRound.buildRound2({ xm2, s, v, id: ECJPAKE_ID_CLIENT, generator });
        const wire = EcJpakeRound.serializeRound2(kp, { prependEcParameters: false });
        const parsed = EcJpakeRound.parseRound2(wire, { expectEcParameters: false });
        expect(EcJpakeRound.verifyRound2Zkp({ kp: parsed, generator, peerId: ECJPAKE_ID_CLIENT })).to.equal(true);
        const expectedXm = generator.point.multiply((xm2 * s) % N).toBytes(false);
        expect(Bytes.toHex(parsed.X)).to.equal(Bytes.toHex(expectedXm));
    });

    it("rejects xm2 = 0 and xm2 >= n", () => {
        const generator = clientGenerator();
        const s = bigintFromHex(vectors.password.hex);
        expect(() => EcJpakeRound.buildRound2({ xm2: 0n, s, v: 1n, id: ECJPAKE_ID_CLIENT, generator })).to.throw(/xm2/);
        expect(() => EcJpakeRound.buildRound2({ xm2: N, s, v: 1n, id: ECJPAKE_ID_CLIENT, generator })).to.throw(/xm2/);
    });

    it("rejects s = 0", () => {
        const generator = clientGenerator();
        expect(() => EcJpakeRound.buildRound2({ xm2: 1n, s: 0n, v: 1n, id: ECJPAKE_ID_CLIENT, generator })).to.throw(
            /s/,
        );
    });

    it("is fully deterministic: same inputs -> identical bytes", () => {
        const generator = clientGenerator();
        const args = {
            xm2: bigintFromHex(vectors.x2),
            s: bigintFromHex(vectors.password.hex),
            v: bigintFromHex(vectors.x4),
            id: ECJPAKE_ID_CLIENT,
            generator,
        };
        const a = EcJpakeRound.buildRound2(args);
        const b = EcJpakeRound.buildRound2(args);
        expect(Bytes.areEqual(a.X, b.X)).to.equal(true);
        expect(Bytes.areEqual(a.zkp.V, b.zkp.V)).to.equal(true);
        expect(Bytes.areEqual(a.zkp.r, b.zkp.r)).to.equal(true);
    });
});
