/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessagePrivacy } from "#codec/MessagePrivacy.js";
import { Bytes, StandardCrypto } from "#general";

describe("MessagePrivacy", () => {
    const crypto = new StandardCrypto();

    describe("buildNonce", () => {
        it("matches the CHIP test vector", () => {
            const mic = Bytes.fromHex("c5a0063ad5d2518191400dd68c5c163b");
            const nonce = MessagePrivacy.buildNonce(0x002a, mic);
            expect(Bytes.toHex(nonce)).equals("002ad2518191400dd68c5c163b");
        });

        it("rejects a MIC that is not 16 bytes", () => {
            expect(() => MessagePrivacy.buildNonce(0x002a, Bytes.fromHex("c5a0063ad5d2518191400d"))).throws(
                /requires a 16-byte MIC/,
            );
        });
    });

    describe("deriveKey", () => {
        it("matches the CHIP group test vector", async () => {
            const operationalKey = Bytes.fromHex("ca92d7a0942d1a511a0e26ad074f4c2f");
            const privacyKey = await MessagePrivacy.deriveKey(crypto, operationalKey);
            expect(Bytes.toHex(privacyKey)).equals("bfe9da016a765365f2dd97a9f939e425");
        });
    });

    describe("obfuscate", () => {
        const privacyKey = Bytes.fromHex("bfe9da016a765365f2dd97a9f939e425");
        const privacyNonce = Bytes.fromHex("db7d408217b3c0c921a2fca4e1");
        const cleartextRegion = Bytes.fromHex("7956341201000000000000000200");
        const obfuscatedRegion = Bytes.fromHex("d926afce24c8a0981bdd44f4e730");

        it("obfuscates the header region", () => {
            const result = MessagePrivacy.obfuscate(crypto, privacyKey, cleartextRegion, privacyNonce);
            expect(Bytes.toHex(result)).equals(Bytes.toHex(obfuscatedRegion));
        });

        it("is symmetric (deobfuscates)", () => {
            const result = MessagePrivacy.obfuscate(crypto, privacyKey, obfuscatedRegion, privacyNonce);
            expect(Bytes.toHex(result)).equals(Bytes.toHex(cleartextRegion));
        });
    });
});
