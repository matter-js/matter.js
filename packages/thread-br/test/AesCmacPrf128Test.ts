/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AesCmac, AesCmacPrf128 } from "../src/crypto/AesCmacPrf128.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures");

interface CmacFixture {
    key: string;
    vectors: Array<{ name: string; messageHex: string; expectedMacHex: string }>;
}

interface PrfFixture {
    messageHex: string;
    vectors: Array<{ name: string; keyHex: string; expectedPrfHex: string }>;
}

function loadJson<T>(name: string): T {
    return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

describe("AesCmac.compute (RFC 4493)", () => {
    const fixture = loadJson<CmacFixture>("rfc4493-cmac-vectors.json");
    const key = Bytes.of(Bytes.fromHex(fixture.key));

    for (const vector of fixture.vectors) {
        it(`matches RFC 4493 ${vector.name}`, () => {
            const message = Bytes.of(Bytes.fromHex(vector.messageHex));
            const mac = AesCmac.compute(key, message);
            expect(Bytes.toHex(mac)).to.equal(vector.expectedMacHex);
        });
    }

    it("rejects non-16-byte keys", () => {
        expect(() => AesCmac.compute(new Uint8Array(15), new Uint8Array())).to.throw(/16 bytes/);
        expect(() => AesCmac.compute(new Uint8Array(17), new Uint8Array())).to.throw(/16 bytes/);
    });
});

describe("AesCmacPrf128.compute (RFC 4615)", () => {
    const fixture = loadJson<PrfFixture>("rfc4615-cmac-prf-vectors.json");
    const message = Bytes.of(Bytes.fromHex(fixture.messageHex));

    for (const vector of fixture.vectors) {
        it(`matches RFC 4615 ${vector.name}`, () => {
            const key = Bytes.of(Bytes.fromHex(vector.keyHex));
            const prf = AesCmacPrf128.compute(key, message);
            expect(Bytes.toHex(prf)).to.equal(vector.expectedPrfHex);
        });
    }

    it("matches AesCmac directly when the key is exactly 16 bytes", () => {
        const key = Bytes.of(Bytes.fromHex("000102030405060708090a0b0c0d0e0f"));
        const prf = AesCmacPrf128.compute(key, message);
        const cmac = AesCmac.compute(key, message);
        expect(Bytes.toHex(prf)).to.equal(Bytes.toHex(cmac));
    });
});
