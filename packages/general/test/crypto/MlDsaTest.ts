/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Base64 } from "#codec/Base64Codec.js";
import { DerBitString, DerCodec, DerNode, DerObject, DerType } from "#codec/DerCodec.js";
import type { Crypto } from "#crypto/Crypto.js";
import { CryptoError, CryptoVerifyError, KeyInputError, SignatureEncodingError } from "#crypto/CryptoError.js";
import { MlDsa } from "#crypto/MlDsa.js";
import { MockCrypto } from "#crypto/MockCrypto.js";
import { type NodeJsCryptoApiLike, NodeJsStyleCrypto } from "#crypto/NodeJsStyleCrypto.js";
import { Pem } from "#crypto/Pem.js";
import { StandardCrypto } from "#crypto/StandardCrypto.js";
import { ImplementationError, InternalError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import { AnnexHCertificates } from "./MlDsaVectors.js";

type AnnexHName = keyof typeof AnnexHCertificates;

function elementsOf(node: DerNode | undefined, count: number) {
    const elements = node?._elements;
    if (elements === undefined || elements.length < count) {
        throw new InternalError(`Expected at least ${count} DER elements`);
    }
    return elements;
}

function parse(name: AnnexHName) {
    const [tbsNode, algorithmNode, signatureNode] = elementsOf(DerCodec.decode(Pem.asDer(AnnexHCertificates[name])), 3);
    const tbsElements = elementsOf(tbsNode, 7);
    return {
        tbs: DerCodec.encode(tbsNode),
        signatureAlgorithm: elementsOf(algorithmNode, 1)[0]._bytes,
        signature: Bytes.of(signatureNode._bytes),
        spki: DerCodec.encode(tbsElements[6]),
    };
}

/** Each Annex H certificate with the certificate whose key signed it. */
const CHAIN: Array<[subject: AnnexHName, issuer: AnnexHName]> = [
    ["paaMlDsa65", "paaMlDsa65"],
    ["paaMlDsa44", "paaMlDsa44"],
    ["paiMlDsa65ByPaaMlDsa65", "paaMlDsa65"],
    ["paiMlDsa44ByPaaMlDsa65", "paaMlDsa65"],
    ["paiEcdsaByPaaMlDsa65", "paaMlDsa65"],
    ["paiMlDsa44ByPaaMlDsa44", "paaMlDsa44"],
    ["paiEcdsaByPaaMlDsa44", "paaMlDsa44"],
    ["dacByPaiMlDsa65", "paiMlDsa65ByPaaMlDsa65"],
    ["dacByPaiMlDsa44", "paiMlDsa44ByPaaMlDsa65"],
];

/** Both backends may throw synchronously, so failures surface as rejections only through an async wrapper. */
async function attempt(action: () => unknown) {
    await action();
}

function flipBit(bytes: Bytes, index: number) {
    const copy = Uint8Array.from(Bytes.of(bytes));
    copy[index] ^= 0x01;
    return copy;
}

const MESSAGE = Bytes.of(Bytes.fromString("PQC Phase 1 device attestation"));

const nodeApi = NodeJsStyleCrypto.detectedCrypto;

/** Whether the runtime verifies ML-DSA natively. */
function nodeCanVerifyMlDsa(api: NodeJsCryptoApiLike) {
    const key = {
        key: Bytes.of(MlDsa.encodeSubjectPublicKeyInfo("ML-DSA-44", new Uint8Array(1312))),
        format: "der",
        type: "spki",
    } as const;
    try {
        return api.verify?.(null, new Uint8Array(), key, new Uint8Array(2420)) === false;
    } catch {
        return false;
    }
}

/** Whether the runtime signs with ML-DSA natively, which Node.js 22 cannot even where it verifies. */
async function nodeCanSignMlDsa(api: NodeJsCryptoApiLike) {
    const { parameterSet, seed, publicKey } = await new StandardCrypto().createMlDsaKeyPair("ML-DSA-44");
    const key = {
        kty: "AKP",
        alg: parameterSet,
        priv: Base64.encode(Bytes.of(seed), true),
        pub: Base64.encode(Bytes.of(publicKey), true),
    } as const;
    try {
        api.sign?.(null, new Uint8Array(), { key, format: "jwk" });
        return api.sign !== undefined;
    } catch {
        return false;
    }
}

/** A Node.js-style API without the key APIs, as offered by runtimes that lack ML-DSA. */
function withoutMlDsa(api: NodeJsCryptoApiLike): NodeJsCryptoApiLike {
    const { sign: _sign, verify: _verify, ...rest } = api;
    return rest;
}

const implementations: Array<[name: string, create: () => Crypto]> = [["StandardCrypto", () => new StandardCrypto()]];
if (nodeApi !== undefined) {
    implementations.push(["NodeJsStyleCrypto", () => new NodeJsStyleCrypto(nodeApi)]);
    implementations.push([
        "NodeJsStyleCrypto without native ML-DSA",
        () => new NodeJsStyleCrypto(withoutMlDsa(nodeApi)),
    ]);
}

describe("MlDsa", () => {
    it("resolves the RFC 9881 algorithm OIDs", () => {
        expect(MlDsa.parameterSetForOid(Bytes.fromHex("608648016503040311"))).equals("ML-DSA-44");
        expect(MlDsa.parameterSetForOid(Bytes.fromHex("608648016503040312"))).equals("ML-DSA-65");
        expect(MlDsa.parameterSetForOid(Bytes.fromHex("608648016503040313"))).undefined; // ML-DSA-87
        expect(MlDsa.parameterSetForOid(Bytes.fromHex("2a8648ce3d040302"))).undefined; // ecdsa-with-SHA256
    });

    it("names the signature algorithm of every Annex H certificate", () => {
        expect(MlDsa.parameterSetForOid(parse("paaMlDsa65").signatureAlgorithm)).equals("ML-DSA-65");
        expect(MlDsa.parameterSetForOid(parse("paaMlDsa44").signatureAlgorithm)).equals("ML-DSA-44");
        expect(MlDsa.parameterSetForOid(parse("dacByPaiMlDsa44").signatureAlgorithm)).equals("ML-DSA-44");
    });

    for (const name of ["paaMlDsa65", "paaMlDsa44"] as const) {
        it(`decodes and re-encodes the ${name} SubjectPublicKeyInfo byte for byte`, () => {
            const { spki } = parse(name);
            const { parameterSet, publicKey } = MlDsa.decodeSubjectPublicKeyInfo(spki);

            expect(publicKey.byteLength).equals(MlDsa.PARAMETERS[parameterSet].publicKeyLength);
            expect(Bytes.toHex(MlDsa.encodeSubjectPublicKeyInfo(parameterSet, publicKey))).equals(Bytes.toHex(spki));
        });
    }

    describe("rejects a SubjectPublicKeyInfo", () => {
        const { publicKey } = MlDsa.decodeSubjectPublicKeyInfo(parse("paaMlDsa44").spki);
        const canonical = MlDsa.encodeSubjectPublicKeyInfo("ML-DSA-44", publicKey);

        const cases: Array<[string, Bytes, RegExp]> = [
            ["with an EC key", parse("paiEcdsaByPaaMlDsa65").spki, /not ML-DSA/],
            ["that is not DER", Bytes.fromHex("3082ffff"), /Invalid SubjectPublicKeyInfo DER/],
            [
                "with AlgorithmIdentifier parameters",
                DerCodec.encode({
                    algorithm: DerObject(MlDsa.PARAMETERS["ML-DSA-44"].oid, {
                        parameters: { _tag: DerType.Null, _bytes: new Uint8Array() },
                    }),
                    publicKey: DerBitString(publicKey),
                }),
                /canonical/,
            ],
            [
                "with a public key of the wrong length",
                DerCodec.encode({
                    algorithm: MlDsa.AlgorithmIdentifier("ML-DSA-65"),
                    publicKey: DerBitString(publicKey),
                }),
                /1952 bytes/,
            ],
            [
                "with the key in an OCTET STRING",
                DerCodec.encode({
                    algorithm: MlDsa.AlgorithmIdentifier("ML-DSA-44"),
                    publicKey: { _tag: DerType.OctetString, _bytes: publicKey },
                }),
                /canonical/,
            ],
            [
                "with BIT STRING padding bits",
                DerCodec.encode({
                    algorithm: MlDsa.AlgorithmIdentifier("ML-DSA-44"),
                    publicKey: DerBitString(publicKey, 1),
                }),
                /canonical/,
            ],
            ["with trailing data", Bytes.concat(canonical, Bytes.fromHex("00")), /canonical/],
        ];

        for (const [description, spki, message] of cases) {
            it(description, () => {
                expect(() => MlDsa.decodeSubjectPublicKeyInfo(spki)).throws(KeyInputError, message);
            });
        }
    });

    it("refuses to encode a public key of the wrong length", () => {
        expect(() => MlDsa.encodeSubjectPublicKeyInfo("ML-DSA-65", new Uint8Array(1312))).throws(KeyInputError);
    });
});

for (const [name, create] of implementations) {
    describe(`${name} ML-DSA`, () => {
        const crypto = create();

        function issuerKey(issuer: AnnexHName) {
            return MlDsa.decodeSubjectPublicKeyInfo(parse(issuer).spki);
        }

        for (const [subject, issuer] of CHAIN) {
            it(`verifies the Annex H ${subject} signature with the ${issuer} key`, async () => {
                const { tbs, signatureAlgorithm, signature } = parse(subject);
                const { parameterSet, publicKey } = issuerKey(issuer);

                expect(MlDsa.parameterSetForOid(signatureAlgorithm)).equals(parameterSet);
                await crypto.verifyMlDsa(parameterSet, publicKey, tbs, signature);
            });
        }

        it("rejects a signature with one bit flipped", async () => {
            const { tbs, signature } = parse("paiMlDsa65ByPaaMlDsa65");
            const { parameterSet, publicKey } = issuerKey("paaMlDsa65");

            await expect(
                attempt(() => crypto.verifyMlDsa(parameterSet, publicKey, tbs, flipBit(signature, 100))),
            ).rejectedWith(CryptoVerifyError);
        });

        it("rejects a tampered certificate body", async () => {
            const { tbs, signature } = parse("dacByPaiMlDsa44");
            const { parameterSet, publicKey } = issuerKey("paiMlDsa44ByPaaMlDsa65");

            await expect(
                attempt(() => crypto.verifyMlDsa(parameterSet, publicKey, flipBit(tbs, 20), signature)),
            ).rejectedWith(CryptoVerifyError);
        });

        it("rejects a signature checked against another key of the same parameter set", async () => {
            const { tbs, signature } = parse("paiMlDsa65ByPaaMlDsa65");
            const { parameterSet, publicKey } = issuerKey("paiMlDsa65ByPaaMlDsa65");

            await expect(attempt(() => crypto.verifyMlDsa(parameterSet, publicKey, tbs, signature))).rejectedWith(
                CryptoVerifyError,
            );
        });

        it("rejects a signature of the other parameter set's length", async () => {
            const { tbs, signature } = parse("paiMlDsa44ByPaaMlDsa44");
            const { publicKey } = issuerKey("paaMlDsa65");

            await expect(attempt(() => crypto.verifyMlDsa("ML-DSA-65", publicKey, tbs, signature))).rejectedWith(
                SignatureEncodingError,
            );
        });

        for (const parameterSet of ["ML-DSA-44", "ML-DSA-65"] as const) {
            it(`signs and verifies with a generated ${parameterSet} key`, async () => {
                const key = await crypto.createMlDsaKeyPair(parameterSet);
                const signature = await crypto.signMlDsa(key, MESSAGE);

                expect(key.seed.byteLength).equals(MlDsa.SEED_LENGTH);
                expect(key.publicKey.byteLength).equals(MlDsa.PARAMETERS[parameterSet].publicKeyLength);
                expect(signature.byteLength).equals(MlDsa.PARAMETERS[parameterSet].signatureLength);
                await crypto.verifyMlDsa(parameterSet, key.publicKey, MESSAGE, signature);
            });
        }

        it("signs chunked data as its concatenation", async () => {
            const key = await crypto.createMlDsaKeyPair("ML-DSA-44");
            const signature = await crypto.signMlDsa(key, [MESSAGE.slice(0, 5), MESSAGE.slice(5)]);

            await crypto.verifyMlDsa("ML-DSA-44", key.publicKey, MESSAGE, signature);
        });

        it("rejects a public key of the wrong length", async () => {
            const { tbs, signature } = parse("paiMlDsa44ByPaaMlDsa44");

            await expect(
                attempt(() => crypto.verifyMlDsa("ML-DSA-44", new Uint8Array(1311), tbs, signature)),
            ).rejectedWith(KeyInputError);
        });

        it("rejects a private key whose public key does not belong to its seed", async () => {
            const key = await crypto.createMlDsaKeyPair("ML-DSA-44");
            const other = await crypto.createMlDsaKeyPair("ML-DSA-44");

            await expect(attempt(() => crypto.signMlDsa({ ...key, publicKey: other.publicKey }, MESSAGE))).rejectedWith(
                KeyInputError,
            );
        });

        it("rejects a private key seed of the wrong length", async () => {
            const key = await crypto.createMlDsaKeyPair("ML-DSA-44");

            await expect(attempt(() => crypto.signMlDsa({ ...key, seed: new Uint8Array(31) }, MESSAGE))).rejectedWith(
                KeyInputError,
                /seed must be 32 bytes/,
            );
        });
    });
}

describe("ML-DSA entropy", () => {
    it("derives the key from the crypto's entropy", async () => {
        const a = await MockCrypto(0x10).createMlDsaKeyPair("ML-DSA-65");
        const b = await MockCrypto(0x10).createMlDsaKeyPair("ML-DSA-65");
        const c = await MockCrypto(0x11).createMlDsaKeyPair("ML-DSA-65");

        expect(Bytes.toHex(a.seed)).equals("10".repeat(32));
        expect(Bytes.toHex(a.publicKey)).equals(Bytes.toHex(b.publicKey));
        expect(Bytes.toHex(a.publicKey)).not.equals(Bytes.toHex(c.publicKey));
    });

    it("hedges portable signatures with the crypto's entropy", async () => {
        const a = MockCrypto(0x20, StandardCrypto);
        const b = MockCrypto(0x20, StandardCrypto);
        const c = MockCrypto(0x21, StandardCrypto);
        const key = await a.createMlDsaKeyPair("ML-DSA-44");
        const signature = Bytes.toHex(await a.signMlDsa(key, MESSAGE));

        expect(Bytes.toHex(await b.signMlDsa(key, MESSAGE))).equals(signature);
        expect(Bytes.toHex(await c.signMlDsa(key, MESSAGE))).not.equals(signature);
    });
});

if (nodeApi !== undefined) {
    const api = nodeApi;

    describe("ML-DSA backend interop", () => {
        for (const parameterSet of ["ML-DSA-44", "ML-DSA-65"] as const) {
            it(`verifies a ${parameterSet} signature from each backend with the other`, async () => {
                const standard = new StandardCrypto();
                const node = new NodeJsStyleCrypto(api);
                const key = await standard.createMlDsaKeyPair(parameterSet);

                await node.verifyMlDsa(parameterSet, key.publicKey, MESSAGE, await standard.signMlDsa(key, MESSAGE));
                await standard.verifyMlDsa(parameterSet, key.publicKey, MESSAGE, await node.signMlDsa(key, MESSAGE));
            });
        }

        it("falls back to the portable implementation where the runtime rejects ML-DSA keys", async () => {
            const crypto = new NodeJsStyleCrypto({
                ...api,
                verify() {
                    throw new ImplementationError("Unsupported key type");
                },
            });
            const { tbs, signature } = parse("paaMlDsa44");
            const { parameterSet, publicKey } = MlDsa.decodeSubjectPublicKeyInfo(parse("paaMlDsa44").spki);

            await crypto.verifyMlDsa(parameterSet, publicKey, tbs, signature);
        });

        it("reports a native signing failure as a key error", async function () {
            const { sign } = api;
            if (sign === undefined || !(await nodeCanSignMlDsa(api))) {
                this.skip();
            }

            let probed = false;
            const crypto = new NodeJsStyleCrypto({
                ...api,
                sign(algorithm, data, key) {
                    if (!probed) {
                        probed = true;
                        return sign.call(api, algorithm, data, key);
                    }
                    throw new ImplementationError("Invalid JWK AKP key");
                },
            });
            const key = await crypto.createMlDsaKeyPair("ML-DSA-44");

            await expect(attempt(() => crypto.signMlDsa(key, MESSAGE))).rejectedWith(KeyInputError, /Cannot sign/);
        });

        it("reports a native verification failure as a verify error", async function () {
            const { verify } = api;
            if (verify === undefined || !nodeCanVerifyMlDsa(api)) {
                this.skip();
            }

            let probed = false;
            const crypto = new NodeJsStyleCrypto({
                ...api,
                verify(algorithm, data, key, signature) {
                    if (!probed) {
                        probed = true;
                        return verify.call(api, algorithm, data, key, signature);
                    }
                    throw new ImplementationError("Unexpected native failure");
                },
            });
            const { tbs, signature } = parse("paaMlDsa44");
            const { parameterSet, publicKey } = MlDsa.decodeSubjectPublicKeyInfo(parse("paaMlDsa44").spki);

            await expect(attempt(() => crypto.verifyMlDsa(parameterSet, publicKey, tbs, signature))).rejectedWith(
                CryptoVerifyError,
            );
        });

        describe("under a restricted cryptographic provider", () => {
            const { tbs, signature } = parse("paaMlDsa44");
            const { parameterSet, publicKey } = MlDsa.decodeSubjectPublicKeyInfo(parse("paaMlDsa44").spki);

            it("does not substitute the portable implementation", async () => {
                const crypto = new NodeJsStyleCrypto({
                    ...withoutMlDsa(api),
                    getFips: () => 1,
                });

                await expect(attempt(() => crypto.verifyMlDsa(parameterSet, publicKey, tbs, signature))).rejectedWith(
                    CryptoError,
                    /restricted/,
                );
            });

            it("does not create keys with the portable implementation", async () => {
                const crypto = new NodeJsStyleCrypto({ ...api, getFips: () => 1 });

                await expect(attempt(() => crypto.createMlDsaKeyPair("ML-DSA-44"))).rejectedWith(
                    CryptoError,
                    /restricted/,
                );
            });

            it("verifies with the provider's own implementation", async function () {
                if (!nodeCanVerifyMlDsa(api)) {
                    this.skip();
                }
                const crypto = new NodeJsStyleCrypto({ ...api, getFips: () => 1 });

                await crypto.verifyMlDsa(parameterSet, publicKey, tbs, signature);
            });
        });

        it("uses each operation natively where Node.js offers it", async function () {
            const { sign, verify } = api;
            const canSign = await nodeCanSignMlDsa(api);
            const canVerify = nodeCanVerifyMlDsa(api);
            if (sign === undefined || verify === undefined || (!canSign && !canVerify)) {
                this.skip();
            }

            // Probes pass empty data, so only operations on MESSAGE are recorded
            const calls = new Array<string>();
            const crypto = new NodeJsStyleCrypto({
                ...api,
                sign(algorithm, data, key) {
                    if (data.byteLength > 0) {
                        calls.push("sign");
                    }
                    return sign.call(api, algorithm, data, key);
                },
                verify(algorithm, data, key, signature) {
                    if (data.byteLength > 0) {
                        calls.push("verify");
                    }
                    return verify.call(api, algorithm, data, key, signature);
                },
            });
            const key = await crypto.createMlDsaKeyPair("ML-DSA-44");

            await crypto.verifyMlDsa("ML-DSA-44", key.publicKey, MESSAGE, await crypto.signMlDsa(key, MESSAGE));

            // Signing verifies its own signature against the key's public key
            expect(calls).deep.equals([...(canSign ? ["sign"] : []), ...(canVerify ? ["verify", "verify"] : [])]);
        });

        it("neither probes nor substitutes signing under a restricted provider", async () => {
            const key = await new StandardCrypto().createMlDsaKeyPair("ML-DSA-44");
            let signCalls = 0;
            const crypto = new NodeJsStyleCrypto({
                ...api,
                getFips: () => 1,
                sign() {
                    signCalls++;
                    throw new ImplementationError("Unexpected signing call");
                },
            });

            await expect(attempt(() => crypto.signMlDsa(key, MESSAGE))).rejectedWith(
                CryptoError,
                /signing is unavailable/,
            );
            expect(signCalls).equals(0);
        });
    });
}
