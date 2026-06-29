/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AesCcm8 } from "../src/dtls/record/AesCcm8.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = resolve(PACKAGE_ROOT, "test/fixtures/dtls");

interface Rfc3610Fixture {
    source: string;
    key: string;
    vectors: Array<{
        name: string;
        nonceHex: string;
        aadHex: string;
        plaintextHex: string;
        encryptedHex: string;
    }>;
}

function loadJson<T>(name: string): T {
    return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

describe("AesCcm8.encrypt (RFC 3610 §8 vectors)", () => {
    const fixture = loadJson<Rfc3610Fixture>("rfc3610-aes128-ccm-vectors.json");
    const key = Bytes.of(Bytes.fromHex(fixture.key));

    for (const vector of fixture.vectors) {
        it(`matches ${vector.name}`, () => {
            const out = AesCcm8.encrypt({
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                plaintext: Bytes.of(Bytes.fromHex(vector.plaintextHex)),
            });
            expect(Bytes.toHex(out)).to.equal(vector.encryptedHex.toLowerCase());
        });
    }
});

describe("AesCcm8.decrypt (RFC 3610 §8 vectors)", () => {
    const fixture = loadJson<Rfc3610Fixture>("rfc3610-aes128-ccm-vectors.json");
    const key = Bytes.of(Bytes.fromHex(fixture.key));

    for (const vector of fixture.vectors) {
        it(`recovers plaintext for ${vector.name}`, () => {
            const pt = AesCcm8.decrypt({
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                ciphertextWithTag: Bytes.of(Bytes.fromHex(vector.encryptedHex)),
            });
            expect(Bytes.toHex(pt)).to.equal(vector.plaintextHex.toLowerCase());
        });
    }

    it("rejects a tampered tag", () => {
        const vector = fixture.vectors[0];
        const tampered = Bytes.of(Bytes.fromHex(vector.encryptedHex));
        tampered[tampered.length - 1] ^= 0x01;
        expect(() =>
            AesCcm8.decrypt({
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                ciphertextWithTag: tampered,
            }),
        ).to.throw();
    });

    it("rejects a tampered ciphertext byte", () => {
        const vector = fixture.vectors[0];
        const tampered = Bytes.of(Bytes.fromHex(vector.encryptedHex));
        tampered[0] ^= 0x80;
        expect(() =>
            AesCcm8.decrypt({
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                ciphertextWithTag: tampered,
            }),
        ).to.throw();
    });

    it("rejects a tampered AAD", () => {
        const vector = fixture.vectors[0];
        const aad = Bytes.of(Bytes.fromHex(vector.aadHex));
        aad[0] ^= 0x01;
        expect(() =>
            AesCcm8.decrypt({
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad,
                ciphertextWithTag: Bytes.of(Bytes.fromHex(vector.encryptedHex)),
            }),
        ).to.throw();
    });

    it("rejects input shorter than the tag", () => {
        expect(() =>
            AesCcm8.decrypt({
                key,
                nonce: new Uint8Array(12),
                aad: new Uint8Array(),
                ciphertextWithTag: new Uint8Array(7),
            }),
        ).to.throw(/tag/);
    });
});

describe("AesCcm8 round-trip", () => {
    const key = new Uint8Array(16).fill(0x42);
    const nonce = new Uint8Array(12).fill(0x55);
    const aad = Bytes.of(Bytes.fromHex("00010203040506070800000000"));

    it("round-trips an empty plaintext", () => {
        const ct = AesCcm8.encrypt({ key, nonce, aad, plaintext: new Uint8Array() });
        expect(ct.length).to.equal(8);
        const pt = AesCcm8.decrypt({ key, nonce, aad, ciphertextWithTag: ct });
        expect(pt.length).to.equal(0);
    });

    it("round-trips a 1024-byte plaintext", () => {
        const plaintext = new Uint8Array(1024);
        for (let i = 0; i < plaintext.length; i++) plaintext[i] = (i * 31) & 0xff;
        const ct = AesCcm8.encrypt({ key, nonce, aad, plaintext });
        expect(ct.length).to.equal(plaintext.length + 8);
        const pt = AesCcm8.decrypt({ key, nonce, aad, ciphertextWithTag: ct });
        expect(Bytes.areEqual(pt, plaintext)).to.equal(true);
    });

    it("rejects a key of wrong length on encrypt", () => {
        expect(() =>
            AesCcm8.encrypt({
                key: new Uint8Array(15),
                nonce,
                aad,
                plaintext: new Uint8Array(),
            }),
        ).to.throw(/16 bytes/);
    });

    it("rejects a key of wrong length on decrypt", () => {
        expect(() =>
            AesCcm8.decrypt({
                key: new Uint8Array(17),
                nonce,
                aad,
                ciphertextWithTag: new Uint8Array(8),
            }),
        ).to.throw(/16 bytes/);
    });
});
