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
import { EcJpakePms } from "../src/dtls/ecjpake/EcJpakePms.js";
import { EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE = resolve(PACKAGE_ROOT, "test/fixtures/ecjpake/mbedtls-self-test-vectors.json");

interface MbedTlsVectors {
    password: { hex: string };
    x1: string;
    x2: string;
    x3: string;
    x4: string;
    cli_two: string;
    srv_two: string;
    pms: string;
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

describe("EcJpakePms.derive (mbedTLS oracle)", () => {
    const vectors = loadVectors();

    it("client side: PMS = mbedTLS test_pms when fed srv_two + own (x2, X4)", () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const xm2 = bigintFromHex(vectors.x2);
        const s = bigintFromHex(vectors.password.hex);
        const pms = EcJpakePms.derive({ Xp, Xp2, xm2, s });
        expect(Bytes.toHex(pms)).to.equal(vectors.pms);
    });

    it("server side: PMS = mbedTLS test_pms when fed cli_two + own (x4, X2)", () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const xm2 = bigintFromHex(vectors.x4);
        const s = bigintFromHex(vectors.password.hex);
        const pms = EcJpakePms.derive({ Xp, Xp2, xm2, s });
        expect(Bytes.toHex(pms)).to.equal(vectors.pms);
    });

    it("PMS is exactly 32 bytes", () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const pms = EcJpakePms.derive({
            Xp,
            Xp2,
            xm2: bigintFromHex(vectors.x4),
            s: bigintFromHex(vectors.password.hex),
        });
        expect(pms.length).to.equal(32);
    });

    it("changes when the password changes", () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const xm2 = bigintFromHex(vectors.x4);
        const sCorrect = bigintFromHex(vectors.password.hex);
        const sWrong = sCorrect ^ 1n;
        const a = EcJpakePms.derive({ Xp, Xp2, xm2, s: sCorrect });
        const b = EcJpakePms.derive({ Xp, Xp2, xm2, s: sWrong });
        expect(Bytes.areEqual(a, b)).to.equal(false);
    });

    it("rejects xm2 = 0 and xm2 >= n", () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const s = bigintFromHex(vectors.password.hex);
        expect(() => EcJpakePms.derive({ Xp, Xp2, xm2: 0n, s })).to.throw(/xm2/);
        expect(() => EcJpakePms.derive({ Xp, Xp2, xm2: N, s })).to.throw(/xm2/);
    });

    it("rejects s = 0", () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const xm2 = bigintFromHex(vectors.x4);
        expect(() => EcJpakePms.derive({ Xp, Xp2, xm2, s: 0n })).to.throw(/s/);
    });
});
