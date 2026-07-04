/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StandardCrypto } from "@matter/general";
import { Pskc } from "../src/crypto/Pskc.js";
import { AesCcm8 } from "../src/dtls/record/AesCcm8.js";

// StandardCrypto is the browser/React-Native-capable backend (WebCrypto + pure-JS AES-CCM/CMAC),
// with no node:crypto dependency. Exercising the package's crypto through it proves runtime portability.
const crypto = new StandardCrypto();

describe("portable crypto smoke (StandardCrypto only, no node:crypto)", () => {
    it("AES-CCM-8 round-trips a DTLS-shaped record (12-byte nonce, L=3)", async () => {
        const key = new Uint8Array(16).fill(0x11);
        const nonce = new Uint8Array(12).fill(0x22);
        const aad = Bytes.of(Bytes.fromHex("00010203040506070800000000"));
        const plaintext = Bytes.of(Bytes.fromHex("deadbeefcafe"));

        const ct = await AesCcm8.encrypt(crypto, { key, nonce, aad, plaintext });
        expect(ct.length).to.equal(plaintext.length + 8);

        const back = await AesCcm8.decrypt(crypto, { key, nonce, aad, ciphertextWithTag: ct });
        expect(Bytes.toHex(back)).to.equal(Bytes.toHex(plaintext));
    });

    it("PSKc derives via pure-JS AES-CMAC (PBKDF2)", () => {
        const pskc = Pskc.derive(crypto, {
            passphrase: "J01NME",
            extPanId: Bytes.of(Bytes.fromHex("000db80000000000")),
            networkName: "OpenThread",
        });
        expect(pskc.length).to.equal(16);
    }).timeout(20_000);
});
