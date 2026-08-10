/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Test fixture converted from a data file so it bundles for the web test runner.
export const data = {
    _note: "Self-generated via Python `cryptography` lib (AES-CMAC) + manual PBKDF2 outer loop matching RFC 8018 §5.2. Not authoritative; anchored end-to-end by pskc-vectors.json (which uses openthread C-test vectors).",
    vectors: [
        {
            name: "1 iter, 16-byte password, 16-byte salt, dkLen=16",
            passwordHex: "000102030405060708090a0b0c0d0e0f",
            saltHex: "6162636465666768696a6b6c6d6e6f70",
            iterations: 1,
            dkLen: 16,
            expectedHex: "10150736884e581c1b8d667f2adae1b8",
        },
        {
            name: "100 iters, 8-byte password, 4-byte salt, dkLen=16",
            passwordHex: "70617373776f7264",
            saltHex: "4e61436c",
            iterations: 100,
            dkLen: 16,
            expectedHex: "a79af44cb5e902a85eb089ed922ca031",
        },
        {
            name: "1000 iters, 4-byte password, 6-byte salt, dkLen=32 (two PRF blocks)",
            passwordHex: "70617373",
            saltHex: "73616c747979",
            iterations: 1000,
            dkLen: 32,
            expectedHex: "bb26444683cec0aace0e614bfe4dbe6cf2c6c6c8c95c42041a635d4398120170",
        },
        {
            name: "16384 iters (Thread MeshCoP iteration count), 6-byte password, 8-byte salt, dkLen=16",
            passwordHex: "4a30314e4d45",
            saltHex: "1122334455667788",
            iterations: 16384,
            dkLen: 16,
            expectedHex: "9ee0c7954c820ad653608e3922e0f1f6",
        },
    ],
};
