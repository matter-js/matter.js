/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import {
    b$,
    Bytes,
    DataReader,
    HASH_ALGORITHM_OUTPUT_LENGTHS,
    HashAlgorithm,
    Key,
    PrivateKey,
    PublicKey,
} from "#general";
import * as assert from "node:assert";
import * as crypto from "node:crypto";

const KEY = b$`abf227feffea8c38e688ddcbffc459f1`;
const ENCRYPTED_DATA = b$`c4527bd6965518e8382edbbd28f27f42492d0766124f9961a772`;
const PLAIN_DATA = b$`03104f3c0000e98ceb00`;
const NONCE = b$`000ce399000000000000000000`;
const ADDITIONAL_AUTH_DATA = b$`00456a000ce39900`;

const KEY_2 = b$`4e4c1353a133397f7a7557c1fbd9ca38`;
const ENCRYPTED_DATA_2 = b$`cb50871ccd35d430b9d9f9f2a50c07f6b0e68ac78f671de670bc6622c3538b10184ac58e70475301edae3d45dd169bfad3a4367cb8eb821676b162`;
const PLAIN_DATA_2 = b$`0609523c01000fe399001528003601153501370024000024013e24020b1835012400001818181824ff0118`;
const NONCE_2 = b$`00ec8ceb000000000000000000`;
const ADDITIONAL_AUTH_DATA_2 = b$`00c7a200ec8ceb00`;

const PRIVATE_KEY = b$`727F1005CBA47ED7822A9D930943621617CFD3B79D9AF528B801ECF9F1992204`;
const PUBLIC_KEY = b$`0462e2b6e1baff8d74a6fd8216c4cb67a3363a31e691492792e61aee610261481396725ef95e142686ba98f339b0ff65bc338bec7b9e8be0bdf3b2774982476220`;

const SEC1_KEY = b$`30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba`;

const HASH_TEST_DATA = b$`047e708746f3d9fb3265a73f0c69ad18cdd48860d7956731eb72873f3d09c17b667c13737017574bf3f826239ff27cdb52fb3e69ff4a06ffd2cbccfdc695ff6096`;

const HASH_TEST_SHA256 = "582418375f09bff6b3bbb2421206ad6aec3c79ff2602f95a68d3e4d23bebe36f";

const cryptoNode = new NodeJsCrypto();

describe("NodeJsCrypto", () => {
    describe("encrypt", () => {
        it("encrypts data", () => {
            const result = cryptoNode.encrypt(KEY_2, PLAIN_DATA_2, NONCE_2, ADDITIONAL_AUTH_DATA_2);

            assert.equal(Bytes.toHex(result), Bytes.toHex(ENCRYPTED_DATA_2));
        });
    });

    describe("decrypt", () => {
        it("decrypts data", () => {
            const result = cryptoNode.decrypt(KEY, ENCRYPTED_DATA, NONCE, ADDITIONAL_AUTH_DATA);

            assert.equal(Bytes.toHex(result), Bytes.toHex(PLAIN_DATA));
        });
    });

    describe("sign & verify with raw keys", () => {
        it("signs data with known private key", () => {
            const result = cryptoNode.signEcdsa(PrivateKey(PRIVATE_KEY), ENCRYPTED_DATA);

            cryptoNode.verifyEcdsa(PublicKey(PUBLIC_KEY), ENCRYPTED_DATA, result);
        });

        // See createKeyPair test for further tests with private key
    });

    describe("sign & verify with SEC1 private and SPKI public keys", () => {
        it("signs data with known sec1 key", () => {
            const result = cryptoNode.signEcdsa(Key({ sec1: SEC1_KEY }), ENCRYPTED_DATA);

            const privateKeyObject = crypto.createPrivateKey({
                key: Buffer.from(Bytes.of(SEC1_KEY)),
                format: "der",
                type: "sec1",
            });
            const publicKey = crypto.createPublicKey(privateKeyObject).export({ format: "der", type: "spki" });

            cryptoNode.verifyEcdsa(Key({ spki: Bytes.of(publicKey) }), ENCRYPTED_DATA, result);
        });
    });

    describe("createKeyPair", () => {
        it("generates a working key pair", () => {
            const key = cryptoNode.createKeyPair();

            cryptoNode.verifyEcdsa(key, ENCRYPTED_DATA, cryptoNode.signEcdsa(key, ENCRYPTED_DATA));
        });

        // Too slow to leave enabled by default but useful for confirming key variance doesn't cause failure
        // it("creates a large volume of private keys", () => {
        //     for (let i = 0; i < 100000; i++) {
        //         if (!(i % 100)) {
        //             console.log(`Key iteration ${i}`);
        //         }
        //         const key = cryptoNode.createKeyPair();

        //         const signature = cryptoNode.sign(key, ENCRYPTED_DATA);
        //         cryptoNode.verify(key, ENCRYPTED_DATA, signature);
        //     }
        // });
    });

    describe("hkdf", () => {
        it("validate group key derivation", async () => {
            const result = await cryptoNode.createHkdfKey(
                b$`235bf7e62823d358dca4ba50b1535f4b`,
                b$`87e1b004e235a130`,
                Bytes.fromString("GroupKey v1.0"),
            );

            assert.equal(Bytes.toHex(result), "a6f5306baf6d050af23ba4bd6b9dd960");
        });

        it("validate group session id derivation", async () => {
            const result = await cryptoNode.createHkdfKey(
                b$`a6f5306baf6d050af23ba4bd6b9dd960`,
                b$``,
                Bytes.fromString("GroupKeyHash"),
                2,
            );

            assert.equal(new DataReader(result).readUInt16(), 0xb9f7);
        });
    });

    it("computes correct DH shared secret", async () => {
        const key1 = cryptoNode.createKeyPair();
        const key2 = cryptoNode.createKeyPair();

        const secret1 = cryptoNode.generateDhSecret(key1, PublicKey(key2.publicBits));
        const secret2 = cryptoNode.generateDhSecret(key2, PublicKey(key1.publicBits));

        expect(secret1).deep.equal(secret2);
        expect(secret1.byteLength).equals(32);
    });

    describe("computeSha256", () => {
        it("hash with single chunk", async () => {
            const hash = await cryptoNode.computeHash(HASH_TEST_DATA);
            expect(Bytes.toHex(hash)).equals(HASH_TEST_SHA256);
        });

        it("hash with multiple chunks", async () => {
            const baseData = Bytes.of(HASH_TEST_DATA);
            const data = [Bytes.of(baseData).slice(0, 30), Bytes.of(baseData).slice(30)];
            const hash = await cryptoNode.computeHash(data);
            expect(Bytes.toHex(hash)).equals(HASH_TEST_SHA256);
        });

        it("hash with async iterator", async () => {
            const baseData = Bytes.of(HASH_TEST_DATA);
            async function* data() {
                yield Bytes.of(baseData).slice(0, 20);
                yield Bytes.of(baseData).slice(20, 40);
                yield Bytes.of(baseData).slice(40);
            }
            const hash = await cryptoNode.computeHash(data());
            expect(Bytes.toHex(hash)).equals(HASH_TEST_SHA256);
        });

        it("Has with ReadableStream", async () => {
            const baseData = Bytes.of(HASH_TEST_DATA);
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(Bytes.of(baseData).slice(0, 20));
                    controller.enqueue(Bytes.of(baseData).slice(20, 40));
                    controller.enqueue(Bytes.of(baseData).slice(40));
                    controller.close();
                },
            });
            const hash = await cryptoNode.computeHash(stream.getReader());
            expect(Bytes.toHex(hash)).equals(HASH_TEST_SHA256);
        });
    });

    describe("Hash Algorithms", () => {
        const testData = b$`48656c6c6f20576f726c64`; // "Hello World"
        const testData2 = b$`54657374204461746121`; // "Test Data!"

        describe("SHA-256", () => {
            it("computes SHA-256 via computeHash", async () => {
                const hash = await cryptoNode.computeHash(testData, "SHA-256");
                expect(Bytes.isBytes(hash)).to.be.true;
                expect(hash.byteLength).to.equal(HASH_ALGORITHM_OUTPUT_LENGTHS["SHA-256"]);
            });

            it("computeSha256() produces same result as computeHash", async () => {
                const hash1 = await cryptoNode.computeHash(testData);
                const hash2 = await cryptoNode.computeHash(testData, "SHA-256");
                expect(Bytes.toHex(hash1)).to.equal(Bytes.toHex(hash2));
            });

            it("supports streaming", async () => {
                const baseData = Bytes.of(testData);
                async function* data() {
                    yield Bytes.of(baseData).slice(0, 5);
                    yield Bytes.of(baseData).slice(5);
                }
                const hashStream = await cryptoNode.computeHash(data(), "SHA-256");
                const hashSingle = await cryptoNode.computeHash(testData, "SHA-256");
                expect(Bytes.toHex(hashStream)).to.equal(Bytes.toHex(hashSingle));
            });

            it("supports array of buffers", async () => {
                const chunk1 = b$`48656c6c6f`; // "Hello"
                const chunk2 = b$`20576f726c64`; // " World"

                const hashArray = await cryptoNode.computeHash([chunk1, chunk2], "SHA-256");
                const hashSingle = await cryptoNode.computeHash(testData, "SHA-256");
                expect(Bytes.toHex(hashArray)).to.equal(Bytes.toHex(hashSingle));
            });
        });

        (["SHA-512", "SHA-384", "SHA-512/224", "SHA-512/256", "SHA3-256"] as HashAlgorithm[]).forEach(alg => {
            describe(alg, () => {
                it(`computes ${alg} via computeHash`, async () => {
                    const hash = await cryptoNode.computeHash(testData, alg);
                    expect(Bytes.isBytes(hash)).to.be.true;
                    expect(hash.byteLength).to.equal(HASH_ALGORITHM_OUTPUT_LENGTHS[alg]);
                });

                it(`supports streaming`, async () => {
                    const baseData = Bytes.of(testData);
                    async function* data() {
                        yield Bytes.of(baseData).slice(0, 5);
                        yield Bytes.of(baseData).slice(5);
                    }
                    const hashStream = await cryptoNode.computeHash(data(), alg);
                    const hashSingle = await cryptoNode.computeHash(testData, alg);
                    expect(Bytes.toHex(hashStream)).to.equal(Bytes.toHex(hashSingle));
                });

                it(`supports array of buffers`, async () => {
                    const chunk1 = b$`48656c6c6f`; // "Hello"
                    const chunk2 = b$`20576f726c64`; // " World"

                    const hashArray = await cryptoNode.computeHash([chunk1, chunk2], alg);
                    const hashSingle = await cryptoNode.computeHash(testData, alg);
                    expect(Bytes.toHex(hashArray)).to.equal(
                        Bytes.toHex(hashSingle),
                        `Algorithm ${alg} array hashing failed`,
                    );
                });

                it("produces different hashes for different inputs", async () => {
                    const hash1 = await cryptoNode.computeHash(testData, alg);
                    const hash2 = await cryptoNode.computeHash(testData2, alg);
                    expect(Bytes.toHex(hash1)).to.not.equal(Bytes.toHex(hash2));
                });
            });
        });
    });
});
