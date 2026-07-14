/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { pbkdf2AesCmac } from "../src/crypto/Pbkdf2AesCmac.js";
import { data as pbkdf2AesCmacVectors } from "./fixtures/pbkdf2-aescmac-vectors.json.js";

interface PbkdfFixture {
    vectors: Array<{
        name: string;
        passwordHex: string;
        saltHex: string;
        iterations: number;
        dkLen: number;
        expectedHex: string;
    }>;
}

const crypto = new StandardCrypto();

describe("pbkdf2AesCmac", () => {
    const fixture: PbkdfFixture = pbkdf2AesCmacVectors;

    for (const vector of fixture.vectors) {
        it(`matches cross-validated vector: ${vector.name}`, () => {
            const password = Bytes.of(Bytes.fromHex(vector.passwordHex));
            const salt = Bytes.of(Bytes.fromHex(vector.saltHex));
            const dk = pbkdf2AesCmac(crypto, {
                password,
                salt,
                iterations: vector.iterations,
                dkLen: vector.dkLen,
            });
            expect(Bytes.toHex(dk)).to.equal(vector.expectedHex);
        }).timeout(20_000); // up to 16384 AES-CMAC iterations; locally sub-second, CI runners far slower
    }

    it("dkLen=32 prefix equals dkLen=16 output for the same inputs", () => {
        const password = new TextEncoder().encode("prefix-test");
        const salt = new TextEncoder().encode("some-salt");
        const dk16 = pbkdf2AesCmac(crypto, { password, salt, iterations: 50, dkLen: 16 });
        const dk32 = Bytes.of(pbkdf2AesCmac(crypto, { password, salt, iterations: 50, dkLen: 32 }));
        expect(Bytes.toHex(dk32.subarray(0, 16))).to.equal(Bytes.toHex(dk16));
    });

    it("rejects non-positive iterations", () => {
        expect(() =>
            pbkdf2AesCmac(crypto, {
                password: new Uint8Array([1]),
                salt: new Uint8Array([2]),
                iterations: 0,
                dkLen: 16,
            }),
        ).to.throw(/iterations/);
        expect(() =>
            pbkdf2AesCmac(crypto, {
                password: new Uint8Array([1]),
                salt: new Uint8Array([2]),
                iterations: -1,
                dkLen: 16,
            }),
        ).to.throw(/iterations/);
    });

    it("rejects non-positive dkLen", () => {
        expect(() =>
            pbkdf2AesCmac(crypto, {
                password: new Uint8Array([1]),
                salt: new Uint8Array([2]),
                iterations: 1,
                dkLen: 0,
            }),
        ).to.throw(/dkLen/);
    });
});
