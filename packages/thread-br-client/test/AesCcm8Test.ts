/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StandardCrypto } from "@matter/general";
import { AesCcm8 } from "../src/dtls/record/AesCcm8.js";
import { data as rfc3610AesCcmVectors } from "./fixtures/dtls/rfc3610-aes128-ccm-vectors.json.js";

const crypto = new StandardCrypto();

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

describe("AesCcm8.encrypt (RFC 3610 §8 vectors)", () => {
    const fixture: Rfc3610Fixture = rfc3610AesCcmVectors;
    const key = Bytes.of(Bytes.fromHex(fixture.key));

    for (const vector of fixture.vectors) {
        it(`matches ${vector.name}`, async () => {
            const out = await AesCcm8.encrypt(crypto, {
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
    const fixture: Rfc3610Fixture = rfc3610AesCcmVectors;
    const key = Bytes.of(Bytes.fromHex(fixture.key));

    for (const vector of fixture.vectors) {
        it(`recovers plaintext for ${vector.name}`, async () => {
            const pt = await AesCcm8.decrypt(crypto, {
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                ciphertextWithTag: Bytes.of(Bytes.fromHex(vector.encryptedHex)),
            });
            expect(Bytes.toHex(pt)).to.equal(vector.plaintextHex.toLowerCase());
        });
    }

    it("rejects a tampered tag", async () => {
        const vector = fixture.vectors[0];
        const tampered = Bytes.of(Bytes.fromHex(vector.encryptedHex));
        tampered[tampered.length - 1] ^= 0x01;
        await expect(
            AesCcm8.decrypt(crypto, {
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                ciphertextWithTag: tampered,
            }),
        ).to.be.rejected;
    });

    it("rejects a tampered ciphertext byte", async () => {
        const vector = fixture.vectors[0];
        const tampered = Bytes.of(Bytes.fromHex(vector.encryptedHex));
        tampered[0] ^= 0x80;
        await expect(
            AesCcm8.decrypt(crypto, {
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad: Bytes.of(Bytes.fromHex(vector.aadHex)),
                ciphertextWithTag: tampered,
            }),
        ).to.be.rejected;
    });

    it("rejects a tampered AAD", async () => {
        const vector = fixture.vectors[0];
        const aad = Bytes.of(Bytes.fromHex(vector.aadHex));
        aad[0] ^= 0x01;
        await expect(
            AesCcm8.decrypt(crypto, {
                key,
                nonce: Bytes.of(Bytes.fromHex(vector.nonceHex)),
                aad,
                ciphertextWithTag: Bytes.of(Bytes.fromHex(vector.encryptedHex)),
            }),
        ).to.be.rejected;
    });

    it("rejects input shorter than the tag", async () => {
        await expect(
            AesCcm8.decrypt(crypto, {
                key,
                nonce: new Uint8Array(12),
                aad: new Uint8Array(),
                ciphertextWithTag: new Uint8Array(7),
            }),
        ).to.be.rejectedWith(/tag/);
    });
});

describe("AesCcm8 round-trip", () => {
    const key = new Uint8Array(16).fill(0x42);
    const nonce = new Uint8Array(12).fill(0x55);
    const aad = Bytes.of(Bytes.fromHex("00010203040506070800000000"));

    it("round-trips an empty plaintext", async () => {
        const ct = Bytes.of(await AesCcm8.encrypt(crypto, { key, nonce, aad, plaintext: new Uint8Array() }));
        expect(ct.length).to.equal(8);
        const pt = Bytes.of(await AesCcm8.decrypt(crypto, { key, nonce, aad, ciphertextWithTag: ct }));
        expect(pt.length).to.equal(0);
    });

    it("round-trips a 1024-byte plaintext", async () => {
        const plaintext = new Uint8Array(1024);
        for (let i = 0; i < plaintext.length; i++) plaintext[i] = (i * 31) & 0xff;
        const ct = Bytes.of(await AesCcm8.encrypt(crypto, { key, nonce, aad, plaintext }));
        expect(ct.length).to.equal(plaintext.length + 8);
        const pt = await AesCcm8.decrypt(crypto, { key, nonce, aad, ciphertextWithTag: ct });
        expect(Bytes.areEqual(pt, plaintext)).to.equal(true);
    });

    it("rejects a key of wrong length on encrypt", async () => {
        await expect(
            AesCcm8.encrypt(crypto, {
                key: new Uint8Array(15),
                nonce,
                aad,
                plaintext: new Uint8Array(),
            }),
        ).to.be.rejectedWith(/16 bytes/);
    });

    it("rejects a key of wrong length on decrypt", async () => {
        await expect(
            AesCcm8.decrypt(crypto, {
                key: new Uint8Array(17),
                nonce,
                aad,
                ciphertextWithTag: new Uint8Array(8),
            }),
        ).to.be.rejectedWith(/16 bytes/);
    });
});
