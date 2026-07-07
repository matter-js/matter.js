/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import { b$, Bytes, Crypto, HashAlgorithm, PrivateKey, PublicKey, StandardCrypto } from "@matter/general";

/**
 * Cross-implementation interop: the pure-JS/WebCrypto {@link StandardCrypto} and the native
 * {@link NodeJsCrypto} must be byte-compatible for every deterministic primitive, and must be able to
 * consume each other's output (encrypt with one, decrypt with the other; sign with one, verify with the
 * other). This guards the runtime-portability contract — a value produced on Node must verify in a
 * browser and vice versa.
 */
const std: Crypto = new StandardCrypto();
const node: Crypto = new NodeJsCrypto();

const KEY = b$`404142434445464748494a4b4c4d4e4f`;
const NONCE_13 = b$`101112131415161718191a1b1c`;
const NONCE_12 = b$`101112131415161718191a1b`;
const AAD = b$`000102030405060708090a0b0c0d0e0f`;
const PLAINTEXT = b$`202122232425262728292a2b2c2d2e2f3031323334353637`;

const PRIVATE_KEY = b$`727F1005CBA47ED7822A9D930943621617CFD3B79D9AF528B801ECF9F1992204`;
const PUBLIC_KEY = b$`0462e2b6e1baff8d74a6fd8216c4cb67a3363a31e691492792e61aee610261481396725ef95e142686ba98f339b0ff65bc338bec7b9e8be0bdf3b2774982476220`;

function hex(bytes: Bytes): string {
    return Bytes.toHex(Bytes.of(bytes));
}

describe("Crypto interop (StandardCrypto <-> NodeJsCrypto)", () => {
    describe("AES-CCM encrypt/decrypt", () => {
        const cases: Array<{ name: string; nonce: Bytes; tagLength: number }> = [
            { name: "tag=16, nonce=13 (L=2, Matter default)", nonce: NONCE_13, tagLength: 16 },
            { name: "tag=8, nonce=13 (L=2)", nonce: NONCE_13, tagLength: 8 },
            { name: "tag=8, nonce=12 (L=3, Thread DTLS)", nonce: NONCE_12, tagLength: 8 },
        ];

        for (const { name, nonce, tagLength } of cases) {
            describe(name, () => {
                it("produces byte-identical ciphertext", () => {
                    const a = std.encrypt(KEY, PLAINTEXT, nonce, AAD, tagLength);
                    const b = node.encrypt(KEY, PLAINTEXT, nonce, AAD, tagLength);
                    expect(hex(a)).equals(hex(b));
                });

                it("decrypts Standard's ciphertext with Node", () => {
                    const ct = std.encrypt(KEY, PLAINTEXT, nonce, AAD, tagLength);
                    expect(hex(node.decrypt(KEY, ct, nonce, AAD, tagLength))).equals(hex(PLAINTEXT));
                });

                it("decrypts Node's ciphertext with Standard", () => {
                    const ct = node.encrypt(KEY, PLAINTEXT, nonce, AAD, tagLength);
                    expect(hex(std.decrypt(KEY, ct, nonce, AAD, tagLength))).equals(hex(PLAINTEXT));
                });
            });
        }
    });

    describe("AES-CMAC", () => {
        it("agrees for a 16-byte message", () => {
            expect(hex(std.cmac(KEY, PLAINTEXT))).equals(hex(node.cmac(KEY, PLAINTEXT)));
        });

        it("agrees for an empty message", () => {
            expect(hex(std.cmac(KEY, new Uint8Array()))).equals(hex(node.cmac(KEY, new Uint8Array())));
        });
    });

    describe("computeHash", () => {
        // Algorithms both backends support (Web Crypto subtle limits StandardCrypto to these).
        const algorithms: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];
        for (const algorithm of algorithms) {
            it(`agrees for ${algorithm}`, async () => {
                const a = Bytes.of(await std.computeHash(PLAINTEXT, algorithm));
                const b = Bytes.of(await node.computeHash(PLAINTEXT, algorithm));
                expect(hex(a)).equals(hex(b));
            });
        }
    });

    describe("signHmac (HMAC-SHA256)", () => {
        it("agrees", async () => {
            const a = Bytes.of(await std.signHmac(KEY, PLAINTEXT));
            const b = Bytes.of(await node.signHmac(KEY, PLAINTEXT));
            expect(hex(a)).equals(hex(b));
        });
    });

    describe("createHkdfKey", () => {
        it("agrees", async () => {
            const a = Bytes.of(await std.createHkdfKey(KEY, AAD, PLAINTEXT, 32));
            const b = Bytes.of(await node.createHkdfKey(KEY, AAD, PLAINTEXT, 32));
            expect(hex(a)).equals(hex(b));
        });
    });

    describe("createPbkdf2Key", () => {
        it("agrees", async () => {
            const a = Bytes.of(await std.createPbkdf2Key(KEY, AAD, 1000, 32));
            const b = Bytes.of(await node.createPbkdf2Key(KEY, AAD, 1000, 32));
            expect(hex(a)).equals(hex(b));
        });
    });

    describe("ecMultiply (P-256)", () => {
        it("agrees for a fixed point and scalar", () => {
            const a = std.ecMultiply(PUBLIC_KEY, PRIVATE_KEY);
            const b = node.ecMultiply(PUBLIC_KEY, PRIVATE_KEY);
            expect(hex(a)).equals(hex(b));
        });
    });

    describe("ECDSA sign/verify cross-verification", () => {
        it("Standard signs, Node verifies", async () => {
            const sig = await std.signEcdsa(PrivateKey(Bytes.of(PRIVATE_KEY)), PLAINTEXT);
            await node.verifyEcdsa(PublicKey(Bytes.of(PUBLIC_KEY)), PLAINTEXT, sig);
        });

        it("Node signs, Standard verifies", async () => {
            const sig = await node.signEcdsa(PrivateKey(Bytes.of(PRIVATE_KEY)), PLAINTEXT);
            await std.verifyEcdsa(PublicKey(Bytes.of(PUBLIC_KEY)), PLAINTEXT, sig);
        });
    });
});
