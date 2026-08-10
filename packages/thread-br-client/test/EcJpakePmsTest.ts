/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StandardCrypto } from "@matter/general";
import { p256 } from "@noble/curves/nist.js";
import { EcJpakePms } from "../src/dtls/ecjpake/EcJpakePms.js";
import { EcJpakeRound } from "../src/dtls/ecjpake/EcJpakeRound.js";
import { data as mbedtlsVectors } from "./fixtures/ecjpake/mbedtls-self-test-vectors.json.js";

const crypto = new StandardCrypto();

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

function bigintFromHex(hex: string): bigint {
    return BigInt("0x" + hex);
}

const Point = p256.Point;
const N = Point.Fn.ORDER;

function pointBytes(scalar: bigint): Uint8Array {
    return Point.BASE.multiply(scalar).toBytes(false);
}

describe("EcJpakePms.derive (mbedTLS oracle)", () => {
    const vectors: MbedTlsVectors = mbedtlsVectors;

    it("client side: PMS = mbedTLS test_pms when fed srv_two + own (x2, X4)", async () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.srv_two)), {
            expectEcParameters: true,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x4));
        const xm2 = bigintFromHex(vectors.x2);
        const s = bigintFromHex(vectors.password.hex);
        const pms = await EcJpakePms.derive(crypto, { Xp, Xp2, xm2, s });
        expect(Bytes.toHex(pms)).to.equal(vectors.pms);
    });

    it("server side: PMS = mbedTLS test_pms when fed cli_two + own (x4, X2)", async () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const xm2 = bigintFromHex(vectors.x4);
        const s = bigintFromHex(vectors.password.hex);
        const pms = await EcJpakePms.derive(crypto, { Xp, Xp2, xm2, s });
        expect(Bytes.toHex(pms)).to.equal(vectors.pms);
    });

    it("PMS is exactly 32 bytes", async () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const pms = await EcJpakePms.derive(crypto, {
            Xp,
            Xp2,
            xm2: bigintFromHex(vectors.x4),
            s: bigintFromHex(vectors.password.hex),
        });
        expect(Bytes.of(pms).length).to.equal(32);
    });

    it("changes when the password changes", async () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const xm2 = bigintFromHex(vectors.x4);
        const sCorrect = bigintFromHex(vectors.password.hex);
        const sWrong = sCorrect ^ 1n;
        const a = await EcJpakePms.derive(crypto, { Xp, Xp2, xm2, s: sCorrect });
        const b = await EcJpakePms.derive(crypto, { Xp, Xp2, xm2, s: sWrong });
        expect(Bytes.areEqual(a, b)).to.equal(false);
    });

    it("rejects xm2 = 0 and xm2 >= n", async () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const s = bigintFromHex(vectors.password.hex);
        await expect(EcJpakePms.derive(crypto, { Xp, Xp2, xm2: 0n, s })).to.be.rejectedWith(/xm2/);
        await expect(EcJpakePms.derive(crypto, { Xp, Xp2, xm2: N, s })).to.be.rejectedWith(/xm2/);
    });

    it("rejects s = 0", async () => {
        const Xp = EcJpakeRound.parseRound2(Bytes.of(Bytes.fromHex(vectors.cli_two)), {
            expectEcParameters: false,
        }).X;
        const Xp2 = pointBytes(bigintFromHex(vectors.x2));
        const xm2 = bigintFromHex(vectors.x4);
        await expect(EcJpakePms.derive(crypto, { Xp, Xp2, xm2, s: 0n })).to.be.rejectedWith(/s/);
    });
});
