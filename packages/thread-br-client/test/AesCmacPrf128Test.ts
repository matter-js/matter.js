/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AesCmacPrf128 } from "../src/crypto/AesCmacPrf128.js";

const PACKAGE_ROOT = process.cwd();
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures");

interface PrfFixture {
    messageHex: string;
    vectors: Array<{ name: string; keyHex: string; expectedPrfHex: string }>;
}

function loadJson<T>(name: string): T {
    return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

const crypto = new StandardCrypto();

describe("AesCmacPrf128.compute (RFC 4615)", () => {
    const fixture = loadJson<PrfFixture>("rfc4615-cmac-prf-vectors.json");
    const message = Bytes.of(Bytes.fromHex(fixture.messageHex));

    for (const vector of fixture.vectors) {
        it(`matches RFC 4615 ${vector.name}`, () => {
            const key = Bytes.of(Bytes.fromHex(vector.keyHex));
            const prf = AesCmacPrf128.compute(crypto, key, message);
            expect(Bytes.toHex(prf)).to.equal(vector.expectedPrfHex);
        });
    }

    it("equals crypto.cmac when the key is exactly 16 bytes", () => {
        const key = Bytes.of(Bytes.fromHex("000102030405060708090a0b0c0d0e0f"));
        expect(Bytes.toHex(AesCmacPrf128.compute(crypto, key, message))).to.equal(
            Bytes.toHex(crypto.cmac(key, message)),
        );
    });
});
