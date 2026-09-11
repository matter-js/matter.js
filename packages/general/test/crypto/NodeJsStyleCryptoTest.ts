/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HashAlgorithm } from "#crypto/Crypto.js";
import { CryptoInputError } from "#crypto/CryptoError.js";
import { NodeJsStyleCrypto, type NodeJsCryptoApiLike } from "#crypto/NodeJsStyleCrypto.js";
import { ImplementationError } from "#MatterError.js";

function unimplemented(name: string) {
    return () => {
        throw new ImplementationError(`This crypto API implements only createHash, not ${name}`);
    };
}

/**
 * Records the digest names {@link NodeJsStyleCrypto.computeHash} asks for.
 *
 * Node.js accepts the Web Crypto spelling as an alias for every digest Matter uses, so the name requested is the only
 * evidence of correct naming available on Node.js itself.
 */
function digestRecorder() {
    const names = new Array<string>();

    const api: NodeJsCryptoApiLike = {
        createHash(algorithm) {
            names.push(algorithm);
            return {
                update() {
                    return this;
                },
                digest: () => new Uint8Array(32),
            };
        },

        createCipheriv: unimplemented("createCipheriv"),
        createDecipheriv: unimplemented("createDecipheriv"),
        randomBytes: unimplemented("randomBytes"),
        createECDH: unimplemented("createECDH"),
        pbkdf2: unimplemented("pbkdf2"),
        hkdf: unimplemented("hkdf"),
        createHmac: unimplemented("createHmac"),
        createSign: unimplemented("createSign"),
        createVerify: unimplemented("createVerify"),
    };

    return { api, names };
}

describe("NodeJsStyleCrypto", () => {
    describe("computeHash", () => {
        const digestNames: [HashAlgorithm, string][] = [
            ["SHA-1", "sha1"],
            ["SHA-256", "sha256"],
            ["SHA-384", "sha384"],
            ["SHA-512", "sha512"],
            ["SHA-512/224", "sha512-224"],
            ["SHA-512/256", "sha512-256"],
            ["SHA3-256", "sha3-256"],
        ];

        for (const [algorithm, expected] of digestNames) {
            it(`asks for ${algorithm} under its OpenSSL name`, () => {
                const { api, names } = digestRecorder();

                new NodeJsStyleCrypto(api).computeHash(new Uint8Array([1, 2, 3]), algorithm);

                expect(names).deep.equal([expected]);
            });
        }

        it("rejects an algorithm it cannot name", () => {
            const { api, names } = digestRecorder();
            const crypto = new NodeJsStyleCrypto(api);

            // computeHash is public API, so an untyped caller can reach this
            expect(() => crypto.computeHash(new Uint8Array([1, 2, 3]), "SHA-224" as HashAlgorithm)).throws(
                CryptoInputError,
                "Unsupported hash algorithm SHA-224",
            );
            expect(names).deep.equal([]);
        });

        it("asks for sha256 when the caller names no algorithm", () => {
            const { api, names } = digestRecorder();

            new NodeJsStyleCrypto(api).computeHash(new Uint8Array([1, 2, 3]));

            expect(names).deep.equal(["sha256"]);
        });
    });
});
