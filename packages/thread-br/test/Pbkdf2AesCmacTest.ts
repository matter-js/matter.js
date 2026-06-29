/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pbkdf2AesCmac } from "../src/crypto/Pbkdf2AesCmac.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures");

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

function loadJson<T>(name: string): T {
    return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

describe("pbkdf2AesCmac", () => {
    const fixture = loadJson<PbkdfFixture>("pbkdf2-aescmac-vectors.json");

    for (const vector of fixture.vectors) {
        it(`matches cross-validated vector: ${vector.name}`, () => {
            const password = Bytes.of(Bytes.fromHex(vector.passwordHex));
            const salt = Bytes.of(Bytes.fromHex(vector.saltHex));
            const dk = pbkdf2AesCmac({
                password,
                salt,
                iterations: vector.iterations,
                dkLen: vector.dkLen,
            });
            expect(Bytes.toHex(dk)).to.equal(vector.expectedHex);
        });
    }

    it("dkLen=32 prefix equals dkLen=16 output for the same inputs", () => {
        const password = new TextEncoder().encode("prefix-test");
        const salt = new TextEncoder().encode("some-salt");
        const dk16 = pbkdf2AesCmac({ password, salt, iterations: 50, dkLen: 16 });
        const dk32 = pbkdf2AesCmac({ password, salt, iterations: 50, dkLen: 32 });
        expect(Bytes.toHex(dk32.subarray(0, 16))).to.equal(Bytes.toHex(dk16));
    });

    it("rejects non-positive iterations", () => {
        expect(() =>
            pbkdf2AesCmac({ password: new Uint8Array([1]), salt: new Uint8Array([2]), iterations: 0, dkLen: 16 }),
        ).to.throw(/iterations/);
        expect(() =>
            pbkdf2AesCmac({ password: new Uint8Array([1]), salt: new Uint8Array([2]), iterations: -1, dkLen: 16 }),
        ).to.throw(/iterations/);
    });

    it("rejects non-positive dkLen", () => {
        expect(() =>
            pbkdf2AesCmac({ password: new Uint8Array([1]), salt: new Uint8Array([2]), iterations: 1, dkLen: 0 }),
        ).to.throw(/dkLen/);
    });
});
