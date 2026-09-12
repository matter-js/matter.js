/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import { cryptoFor, NodeJsEnvironment } from "#environment/NodeJsEnvironment.js";
import {
    Bytes,
    CRYPTO_AUTH_TAG_LENGTH,
    ImplementationError,
    Crypto,
    Entropy,
    HASH_ALGORITHM_OUTPUT_LENGTHS,
    nodeCryptoDefect,
    NodeJsStyleCrypto,
    StandardCrypto,
    type HashAlgorithm,
    type NodeJsCryptoApiLike,
} from "@matter/general";
import * as crypto from "node:crypto";

/** Node.js's own crypto module with one capability replaced. */
function nodeCryptoWith(overrides: Partial<NodeJsCryptoApiLike>): NodeJsCryptoApiLike {
    return { ...crypto, ...overrides };
}

const ABC = Bytes.fromString("abc");

/** The probe only constructs a cipher, so a stub reaches the step under test on a runtime lacking aes-128-ccm. */
function cipherStub() {
    return {
        update: () => new Uint8Array(0),
        final: () => new Uint8Array(0),
        setAAD() {
            return this;
        },
        getAuthTag: () => new Uint8Array(CRYPTO_AUTH_TAG_LENGTH),
    };
}

function decipherStub() {
    return {
        update: () => new Uint8Array(0),
        final: () => new Uint8Array(0),
        setAAD() {
            return this;
        },
        setAuthTag() {
            return this;
        },
    };
}

/** Published digests of "abc" (FIPS 180-4 and FIPS 202). */
const ABC_DIGESTS: [HashAlgorithm, string][] = [
    ["SHA-1", "a9993e364706816aba3e25717850c26c9cd0d89d"],
    ["SHA-256", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["SHA-384", "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7"],
    ["SHA-512/256", "53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23"],
    ["SHA3-256", "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532"],
];

/** Web Crypto implements only these, so they are the ones an independent implementation can check. */
const WEB_CRYPTO_ALGORITHMS: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"];

const ALL_ALGORITHMS: HashAlgorithm[] = [
    "SHA-1",
    "SHA-256",
    "SHA-384",
    "SHA-512",
    "SHA-512/224",
    "SHA-512/256",
    "SHA3-256",
];

describe("nodeCryptoDefect", () => {
    it("finds no defect in Node.js's own crypto module", function () {
        if (NodeJsCrypto.defect !== undefined) {
            this.skip();
        }

        expect(nodeCryptoDefect(crypto)).undefined;
    });

    it("names the cipher where this runtime has no aes-128-ccm", function () {
        if (NodeJsCrypto.defect === undefined) {
            this.skip();
        }

        expect(NodeJsCrypto.defect).match(/^no aes-128-ccm cipher: /);
    });

    it("reports an unsupported digest", () => {
        const defect = nodeCryptoDefect(
            nodeCryptoWith({
                createHash() {
                    throw new Error("Digest method not supported: sha-256");
                },
            }),
        );

        expect(defect).equal("no sha256 digest: Digest method not supported: sha-256");
    });

    it("reports an unavailable cipher", () => {
        const defect = nodeCryptoDefect(
            nodeCryptoWith({
                createCipheriv() {
                    throw new Error("Unknown cipher: aes-128-ccm");
                },
            }),
        );

        expect(defect).equal("no aes-128-ccm cipher: Unknown cipher: aes-128-ccm");
    });

    it("reports the digest before the cipher", () => {
        const defect = nodeCryptoDefect(
            nodeCryptoWith({
                createHash() {
                    throw new Error("no digest");
                },
                createCipheriv() {
                    throw new Error("no cipher");
                },
            }),
        );

        expect(defect).equal("no sha256 digest: no digest");
    });

    it("reports an unavailable decipher", () => {
        const defect = nodeCryptoDefect(
            nodeCryptoWith({
                createCipheriv: cipherStub,
                createDecipheriv() {
                    throw new Error("Unknown cipher: aes-128-ccm");
                },
            }),
        );

        expect(defect).equal("no aes-128-ccm cipher: Unknown cipher: aes-128-ccm");
    });

    it("probes decryption as well as encryption", () => {
        const requested = new Array<string>();

        const defect = nodeCryptoDefect(
            nodeCryptoWith({
                createCipheriv() {
                    requested.push("encrypt");
                    return cipherStub();
                },
                createDecipheriv() {
                    requested.push("decrypt");
                    return decipherStub();
                },
            }),
        );

        expect(defect).undefined;
        expect(requested).deep.equal(["encrypt", "decrypt"]);
    });

    it("probes the cipher Matter encrypts with", () => {
        const requested = new Array<string>();

        nodeCryptoDefect(
            nodeCryptoWith({
                createCipheriv(algorithm, key, iv, options) {
                    requested.push(
                        `${algorithm} key=${Bytes.of(key).byteLength} iv=${Bytes.of(iv).byteLength}` +
                            ` tag=${options.authTagLength}`,
                    );
                    return crypto.createCipheriv(algorithm, Bytes.of(key), Bytes.of(iv), options);
                },
            }),
        );

        expect(requested).deep.equal(["aes-128-ccm key=16 iv=13 tag=16"]);
    });
});

describe("NodeJsCrypto", () => {
    it("reports the same defect as a direct probe of node:crypto", () => {
        expect(NodeJsCrypto.defect).equal(nodeCryptoDefect(crypto));
    });

    describe("digests", () => {
        const nodeCrypto = new NodeJsStyleCrypto(crypto);

        for (const algorithm of WEB_CRYPTO_ALGORITHMS) {
            it(`agrees with StandardCrypto for ${algorithm}`, async () => {
                const fromNode = await nodeCrypto.computeHash(ABC, algorithm);
                const fromStandard = await new StandardCrypto().computeHash(ABC, algorithm);

                expect(Bytes.toHex(fromNode)).equal(Bytes.toHex(fromStandard));
            });
        }

        for (const [algorithm, expected] of ABC_DIGESTS) {
            it(`matches the published digest of "abc" for ${algorithm}`, async () => {
                const hash = await nodeCrypto.computeHash(ABC, algorithm);

                expect(Bytes.toHex(hash)).equal(expected);
            });
        }

        for (const algorithm of ALL_ALGORITHMS) {
            it(`produces ${HASH_ALGORITHM_OUTPUT_LENGTHS[algorithm]} bytes for ${algorithm}`, async () => {
                const hash = await nodeCrypto.computeHash(ABC, algorithm);

                expect(hash.byteLength).equal(HASH_ALGORITHM_OUTPUT_LENGTHS[algorithm]);
            });
        }
    });
});

describe("crypto selection", () => {
    it("uses Node.js crypto where the module reports no defect", () => {
        expect(cryptoFor(undefined)).instanceOf(NodeJsCrypto);
    });

    it("matches the environment to what this runtime can do", () => {
        const env = NodeJsEnvironment();

        expect(env.get(Crypto)).instanceOf(NodeJsCrypto.defect === undefined ? NodeJsCrypto : StandardCrypto);
    });

    /** FIPS mode is process-global and irreversible, so the test reports the restriction rather than imposing it. */
    function withRestrictedProvider(restricted: boolean, fn: () => void) {
        const original = Object.getOwnPropertyDescriptor(NodeJsCrypto, "providerIsRestricted");
        if (original === undefined) {
            throw new ImplementationError("NodeJsCrypto.providerIsRestricted is absent");
        }

        Object.defineProperty(NodeJsCrypto, "providerIsRestricted", { ...original, get: () => restricted });
        try {
            fn();
        } finally {
            Object.defineProperty(NodeJsCrypto, "providerIsRestricted", original);
        }
    }

    it("uses standard crypto where the module reports a defect", () => {
        withRestrictedProvider(false, () => {
            expect(cryptoFor("no aes-128-ccm cipher: Unknown cipher")).instanceOf(StandardCrypto);
        });
    });

    it("keeps Node.js crypto where the process restricts its provider", () => {
        withRestrictedProvider(true, () => {
            expect(cryptoFor("no aes-128-ccm cipher: Unknown cipher")).instanceOf(NodeJsCrypto);
        });
    });

    it("restores the restriction query afterwards", () => {
        withRestrictedProvider(true, () => {});

        expect(NodeJsCrypto.providerIsRestricted).equal(Boolean(crypto.getFips?.()));
    });

    it("gives the environment one implementation for both Crypto and Entropy", () => {
        const env = NodeJsEnvironment();

        expect(env.get(Entropy)).equal(env.get(Crypto));
    });
});
