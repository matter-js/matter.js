/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrivacyEnhancements } from "#crypto/PrivacyEnhancements.js";
import { b$, Bytes } from "#util/Bytes.js";

describe("PrivacyEnhancements", () => {
    describe("derivePrivacyKey", () => {
        it("derives privacy key from operational group key via HKDF (CHIP test vector)", async () => {
            const operationalGroupKey = b$`d0d1d2d3d4d5d6d7d8d9dadbdcdddedf`;
            const expectedPrivacyKey = b$`1c3b88078cdf8dfd34d5b6f3f154433e`;
            const privacyKey = await PrivacyEnhancements.derivePrivacyKey(operationalGroupKey);
            expect(Bytes.toHex(privacyKey)).equals(Bytes.toHex(expectedPrivacyKey));
        });

        it("derives privacy key from unicast encryption key (outbound)", async () => {
            const encryptKey = b$`00112233445566778899aabbccddeeff`;
            const privacyKey = await PrivacyEnhancements.derivePrivacyKey(encryptKey);
            expect(privacyKey.byteLength).equals(16);
        });
    });

    describe("buildPrivacyNonce", () => {
        it("constructs 13-byte privacy nonce from sessionId + MIC suffix (CHIP vector)", () => {
            const sessionId = 0xdb7d;
            const fullMic = b$`00112233445566778899001122334455`;
            const expectedNonce = b$`db7d5566778899001122334455`;
            const nonce = PrivacyEnhancements.buildPrivacyNonce(sessionId, fullMic);
            expect(Bytes.toHex(nonce)).equals(Bytes.toHex(expectedNonce));
            expect(nonce.byteLength).equals(13);
        });
    });

    describe("privacyTransform (obfuscation & deobfuscation)", () => {
        it("obfuscates header region with privacy key + nonce", () => {
            const privacyKey = b$`4c1e6e5ef9f7e8e7dcd3c4b5a6971828`;
            const privacyNonce = b$`db7d5566778899001122334455`;
            const plaintext = b$`00000001abcdef0123456789abcdef01`;
            const encrypted = PrivacyEnhancements.privacyTransform(privacyKey, privacyNonce, plaintext);
            // Verify it's not the same as input
            expect(Bytes.toHex(encrypted)).does.not.equal(Bytes.toHex(plaintext));
        });

        it("deobfuscates (symmetric operation)", () => {
            const privacyKey = b$`4c1e6e5ef9f7e8e7dcd3c4b5a6971828`;
            const privacyNonce = b$`db7d5566778899001122334455`;
            const plaintext = b$`00000001abcdef0123456789abcdef01`;
            const obfuscated = PrivacyEnhancements.privacyTransform(privacyKey, privacyNonce, plaintext);
            const deobfuscated = PrivacyEnhancements.privacyTransform(privacyKey, privacyNonce, obfuscated);
            // Should get back original plaintext
            expect(Bytes.toHex(deobfuscated)).equals(Bytes.toHex(plaintext));
        });

        it("preserves length across obfuscate/deobfuscate", () => {
            const privacyKey = b$`4c1e6e5ef9f7e8e7dcd3c4b5a6971828`;
            const privacyNonce = b$`db7d5566778899001122334455`;
            const plaintext = b$`0102030405060708090a0b0c0d0e0f10`;
            const obfuscated = PrivacyEnhancements.privacyTransform(privacyKey, privacyNonce, plaintext);
            const deobfuscated = PrivacyEnhancements.privacyTransform(privacyKey, privacyNonce, obfuscated);
            expect(Bytes.toHex(deobfuscated)).equals(Bytes.toHex(plaintext));
            expect(obfuscated.byteLength).equals(plaintext.byteLength);
        });
    });
});
