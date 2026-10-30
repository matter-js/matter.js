/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import {
    b$,
    Bytes,
    Crypto,
    CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES,
    CRYPTO_AEAD_MAX_CIPHERTEXT_LENGTH_BYTES,
    cryptoAeadMaxCiphertextLength,
    cryptoAeadMaxPlaintextLength,
    CryptoDecryptError,
    CryptoInputError,
    HashAlgorithm,
    PrivateKey,
    PublicKey,
    StandardCrypto,
} from "@matter/general";

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
const NONCE_11 = b$`101112131415161718191a`;
const AAD = b$`000102030405060708090a0b0c0d0e0f`;
const PLAINTEXT = b$`202122232425262728292a2b2c2d2e2f3031323334353637`;

const PRIVATE_KEY = b$`727F1005CBA47ED7822A9D930943621617CFD3B79D9AF528B801ECF9F1992204`;
const PUBLIC_KEY = b$`0462e2b6e1baff8d74a6fd8216c4cb67a3363a31e691492792e61aee610261481396725ef95e142686ba98f339b0ff65bc338bec7b9e8be0bdf3b2774982476220`;

type Outcome = "accepted" | "refused";

function hex(bytes: Bytes): string {
    return Bytes.toHex(Bytes.of(bytes));
}

describe("Crypto interop (StandardCrypto <-> NodeJsCrypto)", () => {
    describe("AES-CCM encrypt/decrypt", () => {
        // Some runtimes emulate Node.js without an aes-128-ccm cipher, so these cannot run there
        before(function () {
            if (NodeJsCrypto.defect !== undefined) {
                this.skip();
            }
        });

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

    describe("AES-CCM input limits", () => {
        // Some runtimes emulate Node.js without an aes-128-ccm cipher, so these cannot run there
        before(function () {
            if (NodeJsCrypto.defect !== undefined) {
                this.skip();
            }
        });

        // Literals, not the constants, so a wrong constant fails here
        const MAX_PLAINTEXT_13 = 0xffff;
        const MAX_CIPHERTEXT_13 = 0x1000f;
        const MAX_AAD = 0xffff;

        it("derives the limits NIST SP 800-38C gives", () => {
            expect(cryptoAeadMaxPlaintextLength(13)).equals(MAX_PLAINTEXT_13);
            expect(cryptoAeadMaxPlaintextLength(12)).equals(0xffffff);
            expect(CRYPTO_AEAD_MAX_CIPHERTEXT_LENGTH_BYTES).equals(MAX_CIPHERTEXT_13);
            expect(cryptoAeadMaxCiphertextLength(13, 8)).equals(0x10007);
            expect(CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES).equals(MAX_AAD);
        });

        const decryptCases: [string, { data: number; aad: number; nonce: Bytes; tag?: number }, Outcome][] = [
            ["the largest ciphertext", { data: MAX_CIPHERTEXT_13, aad: 0, nonce: NONCE_13 }, "accepted"],
            ["a ciphertext one byte too long", { data: MAX_CIPHERTEXT_13 + 1, aad: 0, nonce: NONCE_13 }, "refused"],
            ["a ciphertext as long as the tag", { data: 16, aad: 0, nonce: NONCE_13 }, "accepted"],
            ["a ciphertext shorter than the tag", { data: 15, aad: 0, nonce: NONCE_13 }, "refused"],
            ["the largest AAD", { data: 32, aad: MAX_AAD, nonce: NONCE_13 }, "accepted"],
            ["an AAD one byte too long", { data: 32, aad: MAX_AAD + 1, nonce: NONCE_13 }, "refused"],
            ["a 12-byte nonce", { data: 32, aad: 0, nonce: NONCE_12 }, "accepted"],
            [
                "a ciphertext one byte too long for a 12-byte nonce",
                { data: 0x1000000 + 16, aad: 0, nonce: NONCE_12 },
                "refused",
            ],
            ["an 11-byte nonce", { data: 32, aad: 0, nonce: NONCE_11 }, "refused"],
            ["a 14-byte nonce", { data: 32, aad: 0, nonce: Bytes.concat(NONCE_13, b$`1d`) }, "refused"],
            ["a 4-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 4 }, "accepted"],
            ["a 2-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 2 }, "refused"],
            ["a 5-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 5 }, "refused"],
            ["an 18-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 18 }, "refused"],
        ];

        const encryptCases: [string, { data: number; aad: number; nonce: Bytes; tag?: number }][] = [
            ["a plaintext one byte too long", { data: MAX_PLAINTEXT_13 + 1, aad: 0, nonce: NONCE_13 }],
            ["an AAD one byte too long", { data: 32, aad: MAX_AAD + 1, nonce: NONCE_13 }],
            ["an 11-byte nonce", { data: 32, aad: 0, nonce: NONCE_11 }],
            ["a 14-byte nonce", { data: 32, aad: 0, nonce: Bytes.concat(NONCE_13, b$`1d`) }],
            ["a 2-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 2 }],
            ["a 5-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 5 }],
            ["an 18-byte tag", { data: 32, aad: 0, nonce: NONCE_13, tag: 18 }],
        ];

        function aadOf(length: number) {
            return length > 0 ? new Uint8Array(length).fill(0xa5) : undefined;
        }

        for (const [name, crypto] of [
            ["StandardCrypto", std],
            ["NodeJsCrypto", node],
        ] satisfies [string, Crypto][]) {
            for (const [what, { data, aad, nonce, tag }, outcome] of decryptCases) {
                it(`${name} ${outcome === "accepted" ? "tries to decrypt" : "refuses to decrypt"} ${what}`, () => {
                    const decrypt = () => crypto.decrypt(KEY, new Uint8Array(data), nonce, aadOf(aad), tag);
                    expect(decrypt).throws(outcome === "accepted" ? CryptoDecryptError : CryptoInputError);
                });
            }

            for (const [what, { data, aad, nonce, tag }] of encryptCases) {
                it(`${name} refuses to encrypt ${what}`, () => {
                    expect(() => crypto.encrypt(KEY, new Uint8Array(data), nonce, aadOf(aad), tag)).throws(
                        CryptoInputError,
                    );
                });
            }
        }

        const crossCases: [string, { data: number; aad: number; nonce: Bytes }][] = [
            ["the largest plaintext", { data: MAX_PLAINTEXT_13, aad: 0, nonce: NONCE_13 }],
            ["the largest AAD with a 2-byte length field", { data: 32, aad: 0xfeff, nonce: NONCE_13 }],
            ["the shortest AAD with a 6-byte length field", { data: 32, aad: 0xff00, nonce: NONCE_13 }],
            ["the largest AAD", { data: 32, aad: MAX_AAD, nonce: NONCE_13 }],
            [
                "a plaintext that needs the 3-byte length field of a 12-byte nonce",
                { data: MAX_PLAINTEXT_13 + 17, aad: 0, nonce: NONCE_12 },
            ],
        ];

        for (const [what, { data, aad, nonce }] of crossCases) {
            describe(what, () => {
                const plaintext = new Uint8Array(data).fill(0x5a);

                it("encrypts to the same ciphertext with both implementations", () => {
                    expect(hex(std.encrypt(KEY, plaintext, nonce, aadOf(aad)))).equals(
                        hex(node.encrypt(KEY, plaintext, nonce, aadOf(aad))),
                    );
                });

                it("decrypts Standard's ciphertext with Node", () => {
                    const ciphertext = std.encrypt(KEY, plaintext, nonce, aadOf(aad));
                    expect(hex(node.decrypt(KEY, ciphertext, nonce, aadOf(aad)))).equals(hex(plaintext));
                });

                it("decrypts Node's ciphertext with Standard", () => {
                    const ciphertext = node.encrypt(KEY, plaintext, nonce, aadOf(aad));
                    expect(hex(std.decrypt(KEY, ciphertext, nonce, aadOf(aad)))).equals(hex(plaintext));
                });
            });
        }
    });
});
