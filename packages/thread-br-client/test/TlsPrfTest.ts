/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, NodeJsStyleCrypto, StandardCrypto } from "@matter/general";
import { TlsPrf } from "../src/dtls/prf/TlsPrf.js";
import { data as tlsPrfVectors } from "./fixtures/dtls/tls-prf-vectors.json.js";

// Exercise both MaybePromise<Bytes> shapes returned by Crypto.signHmac: StandardCrypto
// resolves asynchronously, NodeJsStyleCrypto returns synchronously. NodeJsStyleCrypto is
// node-only (synchronous node:crypto), so it is skipped in the browser test runner.
const cryptos: [string, Crypto][] = [["StandardCrypto", new StandardCrypto()]];
if (typeof window === "undefined") {
    cryptos.push(["NodeJsStyleCrypto", new NodeJsStyleCrypto()]);
}

interface PrfVector {
    name: string;
    secretHex: string;
    label: string;
    seedHex: string;
    outputLen: number;
    expectedHex: string;
    _source: string;
}

interface MasterSecretVector {
    premasterSecretHex: string;
    clientRandomHex: string;
    serverRandomHex: string;
    expectedMasterSecretHex: string;
}

interface KeyBlockVector {
    masterSecretHex: string;
    clientRandomHex: string;
    serverRandomHex: string;
    expectedKeyBlockHex: string;
    expectedClientWriteKeyHex: string;
    expectedServerWriteKeyHex: string;
    expectedClientWriteIvHex: string;
    expectedServerWriteIvHex: string;
}

interface FinishedVector {
    masterSecretHex: string;
    transcriptDigestHex: string;
    role: "client" | "server";
    expectedVerifyDataHex: string;
}

interface Fixture {
    prfVectors: PrfVector[];
    masterSecretVector: MasterSecretVector;
    keyBlockVector: KeyBlockVector;
    finishedVectors: FinishedVector[];
}

function loadFixture(): Fixture {
    // Cast needed: the fixture module's inferred type widens role to string, not the "client" | "server" union.
    return tlsPrfVectors as Fixture;
}

for (const [cryptoName, crypto] of cryptos) {
    describe(`TlsPrf.compute (RFC 5246 §5 / RFC 6655) [${cryptoName}]`, () => {
        const fixture = loadFixture();

        for (const vector of fixture.prfVectors) {
            it(`matches ${vector.name}`, async () => {
                const out = Bytes.of(
                    await TlsPrf.compute(crypto, {
                        secret: Bytes.of(Bytes.fromHex(vector.secretHex)),
                        label: vector.label,
                        seed: Bytes.of(Bytes.fromHex(vector.seedHex)),
                        outputLength: vector.outputLen,
                    }),
                );
                expect(Bytes.toHex(out)).to.equal(vector.expectedHex);
                expect(out.length).to.equal(vector.outputLen);
            });
        }

        it("stream truncation: first N bytes of a long output equal the same call with outputLength=N", async () => {
            const secret = new Uint8Array(16).fill(0x42);
            const seed = new Uint8Array(32).fill(0x37);
            const longOut = Bytes.of(
                await TlsPrf.compute(crypto, { secret, label: "trunc test", seed, outputLength: 100 }),
            );
            for (const truncLen of [1, 16, 31, 32, 33, 64]) {
                const shortOut = await TlsPrf.compute(crypto, {
                    secret,
                    label: "trunc test",
                    seed,
                    outputLength: truncLen,
                });
                expect(Bytes.areEqual(shortOut, longOut.subarray(0, truncLen))).to.equal(true);
            }
        });

        it("outputLength = 0 returns an empty Uint8Array", async () => {
            const out = Bytes.of(
                await TlsPrf.compute(crypto, {
                    secret: new Uint8Array(16),
                    label: "anything",
                    seed: new Uint8Array(8),
                    outputLength: 0,
                }),
            );
            expect(out.length).to.equal(0);
        });

        it("rejects negative outputLength", async () => {
            await expect(
                TlsPrf.compute(crypto, {
                    secret: new Uint8Array(16),
                    label: "x",
                    seed: new Uint8Array(),
                    outputLength: -1,
                }),
            ).to.be.rejectedWith(/outputLength/);
        });

        it("output differs when only the label changes", async () => {
            const args = {
                secret: new Uint8Array(16).fill(0x11),
                seed: new Uint8Array(32).fill(0x22),
                outputLength: 32,
            } as const;
            const a = await TlsPrf.compute(crypto, { ...args, label: "label A" });
            const b = await TlsPrf.compute(crypto, { ...args, label: "label B" });
            expect(Bytes.areEqual(a, b)).to.equal(false);
        });
    });

    describe(`TlsPrf.masterSecret (RFC 5246 §8.1) [${cryptoName}]`, () => {
        const v = loadFixture().masterSecretVector;

        it("matches the synthesized PRF reference", async () => {
            const ms = Bytes.of(
                await TlsPrf.masterSecret(crypto, {
                    premasterSecret: Bytes.of(Bytes.fromHex(v.premasterSecretHex)),
                    clientRandom: Bytes.of(Bytes.fromHex(v.clientRandomHex)),
                    serverRandom: Bytes.of(Bytes.fromHex(v.serverRandomHex)),
                }),
            );
            expect(Bytes.toHex(ms)).to.equal(v.expectedMasterSecretHex);
            expect(ms.length).to.equal(48);
        });

        it("rejects a clientRandom of wrong length", async () => {
            await expect(
                TlsPrf.masterSecret(crypto, {
                    premasterSecret: new Uint8Array(32),
                    clientRandom: new Uint8Array(31),
                    serverRandom: new Uint8Array(32),
                }),
            ).to.be.rejectedWith(/clientRandom/);
        });

        it("rejects a serverRandom of wrong length", async () => {
            await expect(
                TlsPrf.masterSecret(crypto, {
                    premasterSecret: new Uint8Array(32),
                    clientRandom: new Uint8Array(32),
                    serverRandom: new Uint8Array(33),
                }),
            ).to.be.rejectedWith(/serverRandom/);
        });
    });

    describe(`TlsPrf.keyBlock (RFC 5246 §6.3 / RFC 6655 §3, AES-128-CCM-8) [${cryptoName}]`, () => {
        const v = loadFixture().keyBlockVector;

        it("matches the synthesized PRF reference and slices the AEAD layout correctly", async () => {
            const block = await TlsPrf.keyBlock(crypto, {
                masterSecret: Bytes.of(Bytes.fromHex(v.masterSecretHex)),
                clientRandom: Bytes.of(Bytes.fromHex(v.clientRandomHex)),
                serverRandom: Bytes.of(Bytes.fromHex(v.serverRandomHex)),
            });
            expect(Bytes.toHex(block.clientWriteKey)).to.equal(v.expectedClientWriteKeyHex);
            expect(Bytes.toHex(block.serverWriteKey)).to.equal(v.expectedServerWriteKeyHex);
            expect(Bytes.toHex(block.clientWriteIv)).to.equal(v.expectedClientWriteIvHex);
            expect(Bytes.toHex(block.serverWriteIv)).to.equal(v.expectedServerWriteIvHex);
            expect(Bytes.of(block.clientWriteKey).length).to.equal(16);
            expect(Bytes.of(block.serverWriteKey).length).to.equal(16);
            expect(Bytes.of(block.clientWriteIv).length).to.equal(4);
            expect(Bytes.of(block.serverWriteIv).length).to.equal(4);
        });

        it("uses the (server || client) seed order — swapping the randoms changes the output", async () => {
            const ms = Bytes.of(Bytes.fromHex(v.masterSecretHex));
            const cr = Bytes.of(Bytes.fromHex(v.clientRandomHex));
            const sr = Bytes.of(Bytes.fromHex(v.serverRandomHex));
            const correct = await TlsPrf.keyBlock(crypto, { masterSecret: ms, clientRandom: cr, serverRandom: sr });
            const swapped = await TlsPrf.keyBlock(crypto, { masterSecret: ms, clientRandom: sr, serverRandom: cr });
            expect(Bytes.areEqual(correct.clientWriteKey, swapped.clientWriteKey)).to.equal(false);
        });

        it("rejects a masterSecret of wrong length", async () => {
            await expect(
                TlsPrf.keyBlock(crypto, {
                    masterSecret: new Uint8Array(32),
                    clientRandom: new Uint8Array(32),
                    serverRandom: new Uint8Array(32),
                }),
            ).to.be.rejectedWith(/masterSecret/);
        });
    });

    describe(`TlsPrf.verifyData (RFC 5246 §7.4.9) [${cryptoName}]`, () => {
        const fixture = loadFixture();

        for (const vector of fixture.finishedVectors) {
            it(`matches ${vector.role}-side Finished verify_data`, async () => {
                const out = Bytes.of(
                    await TlsPrf.verifyData(crypto, {
                        masterSecret: Bytes.of(Bytes.fromHex(vector.masterSecretHex)),
                        role: vector.role,
                        transcriptDigest: Bytes.of(Bytes.fromHex(vector.transcriptDigestHex)),
                    }),
                );
                expect(Bytes.toHex(out)).to.equal(vector.expectedVerifyDataHex);
                expect(out.length).to.equal(12);
            });
        }

        it("client and server roles produce different verify_data for the same transcript", async () => {
            const ms = Bytes.of(Bytes.fromHex(fixture.finishedVectors[0].masterSecretHex));
            const td = Bytes.of(Bytes.fromHex(fixture.finishedVectors[0].transcriptDigestHex));
            const c = await TlsPrf.verifyData(crypto, { masterSecret: ms, role: "client", transcriptDigest: td });
            const s = await TlsPrf.verifyData(crypto, { masterSecret: ms, role: "server", transcriptDigest: td });
            expect(Bytes.areEqual(c, s)).to.equal(false);
        });

        it("rejects a transcriptDigest of wrong length", async () => {
            await expect(
                TlsPrf.verifyData(crypto, {
                    masterSecret: new Uint8Array(48),
                    role: "client",
                    transcriptDigest: new Uint8Array(31),
                }),
            ).to.be.rejectedWith(/transcriptDigest/);
        });
    });
}
