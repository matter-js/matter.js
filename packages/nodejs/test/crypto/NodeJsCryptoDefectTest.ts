/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { nodeCryptoDefect, NodeJsCrypto } from "#crypto/NodeJsCrypto.js";
import {
    Bytes,
    HASH_ALGORITHM_OUTPUT_LENGTHS,
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
    it("finds no defect in Node.js's own crypto module", () => {
        expect(nodeCryptoDefect(crypto)).undefined;
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
    it("finds no defect in the current runtime", () => {
        expect(NodeJsCrypto.defect).undefined;
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
