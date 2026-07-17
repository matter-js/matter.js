/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { Pskc } from "../src/crypto/Pskc.js";
import { data as pskcVectors } from "./fixtures/pskc-vectors.json.js";

interface PskcFixture {
    vectors: Array<{
        name: string;
        passphrase: string;
        extPanIdHex: string;
        networkName: string;
        expectedPskcHex: string;
        source: string;
    }>;
}

const crypto = new StandardCrypto();

describe("Pskc.derive", () => {
    const fixture: PskcFixture = pskcVectors;

    for (const vector of fixture.vectors) {
        it(`matches ${vector.name}`, () => {
            const pskc = Pskc.derive(crypto, {
                passphrase: vector.passphrase,
                extPanId: Bytes.of(Bytes.fromHex(vector.extPanIdHex)),
                networkName: vector.networkName,
            });
            expect(Bytes.toHex(pskc)).to.equal(vector.expectedPskcHex);
        }).timeout(20_000); // 16384-iteration MeshCoP KDF; locally sub-second, CI runners far slower
    }

    it("rejects passphrases shorter than 6 UTF-8 bytes", () => {
        expect(() =>
            Pskc.derive(crypto, { passphrase: "short", extPanId: new Uint8Array(8), networkName: "Net" }),
        ).to.throw(/passphrase/);
    });

    it("rejects passphrases longer than 255 UTF-8 bytes", () => {
        expect(() =>
            Pskc.derive(crypto, { passphrase: "x".repeat(256), extPanId: new Uint8Array(8), networkName: "Net" }),
        ).to.throw(/passphrase/);
    });

    it("rejects extPanId of wrong length", () => {
        expect(() =>
            Pskc.derive(crypto, { passphrase: "abcdef", extPanId: new Uint8Array(7), networkName: "Net" }),
        ).to.throw(/extPanId/);
    });

    it("rejects empty networkName", () => {
        expect(() =>
            Pskc.derive(crypto, { passphrase: "abcdef", extPanId: new Uint8Array(8), networkName: "" }),
        ).to.throw(/networkName/);
    });

    it("rejects networkName longer than 16 UTF-8 bytes", () => {
        expect(() =>
            Pskc.derive(crypto, { passphrase: "abcdef", extPanId: new Uint8Array(8), networkName: "x".repeat(17) }),
        ).to.throw(/networkName/);
    });
});
