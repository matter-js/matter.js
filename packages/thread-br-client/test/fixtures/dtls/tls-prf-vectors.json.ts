/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Test fixture converted from a data file so it bundles for the web test runner.
export const data = {
    _format:
        "TLS 1.2 PRF (P_SHA256) test vectors. Each vector documents its source. mbedTLS-derived vectors use the project's official test data; synthesized vectors are generated via an independent Python reference (hashlib HMAC-SHA256) and cross-checked against the mbedTLS vector to confirm the reference is correct.",
    _python_reference:
        "def p_sha256(secret, seed, n):\n    out = b''; a = seed\n    while len(out) < n:\n        a = hmac.new(secret, a, hashlib.sha256).digest()\n        out += hmac.new(secret, a + seed, hashlib.sha256).digest()\n    return out[:n]\ndef prf(secret, label, seed, n):\n    return p_sha256(secret, label.encode('ascii') + seed, n)",
    prfVectors: [
        {
            name: "mbedtls_v3_6_6_tls_prf_sha256",
            secretHex:
                "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            label: "test tls_prf label",
            seedHex:
                "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            outputLen: 16,
            expectedHex: "7f9998393198a02c8d731ccc2ef90b2c",
            _source: "mbedTLS v3.6.6 tests/suites/test_suite_ssl.data — SSL TLS_PRF MBEDTLS_SSL_TLS_PRF_SHA256",
        },
        {
            name: "short_secret_100_byte_output",
            secretHex: "0102030405060708",
            label: "expansion check",
            seedHex: "deadbeefdeadbeefdeadbeefdeadbeef",
            outputLen: 100,
            expectedHex:
                "4667c2a642a143e6e1dd38b38c00faab3b7d5871474cfba8a33e8dd61ed16193afafc6dd069d72d0de784507ae9535540582db0401b347b1d222b5964d1615090eb6b20a2a72c7156a42fdf4db1bb801a1aeb1acf54333a99e654a7ce8b15cd235e06961",
            _source:
                "Synthesized via Python ref P_SHA256 (RFC 5246 §5). HMAC-SHA256 from hashlib; 100-byte output exercises 4 P_SHA256 blocks (each 32 B).",
        },
        {
            name: "empty_seed_empty_label",
            secretHex: "00112233445566778899aabbccddeeff",
            label: "",
            seedHex: "",
            outputLen: 32,
            expectedHex: "7ab2aa6bc31d99c8bd1514b571f36c2484a16adf42e5ec49707f86d21ee58f3c",
            _source: "Synthesized via Python ref P_SHA256 (RFC 5246 §5). Verifies empty label/seed don't crash.",
        },
    ],
    masterSecretVector: {
        name: "master_secret_synth",
        premasterSecretHex: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        clientRandomHex: "c000000000000000000000000000000000000000000000000000000000000000",
        serverRandomHex: "5e00000000000000000000000000000000000000000000000000000000000000",
        expectedMasterSecretHex:
            "c7611541a06be48b05e4306ac8296f1b9e99e558cd2f2eb5b957302cfcf9080db0ec1f85f2d22d93e6553edf3c7611e1",
        _source:
            "Synthesized via Python ref P_SHA256. PMS is 32 bytes of 0xAA (mimics EcJpakePms output length). Random nonces have a single non-zero leading byte for visual separation.",
    },
    keyBlockVector: {
        name: "key_block_synth_aes128_ccm_8",
        masterSecretHex:
            "c7611541a06be48b05e4306ac8296f1b9e99e558cd2f2eb5b957302cfcf9080db0ec1f85f2d22d93e6553edf3c7611e1",
        clientRandomHex: "c000000000000000000000000000000000000000000000000000000000000000",
        serverRandomHex: "5e00000000000000000000000000000000000000000000000000000000000000",
        expectedKeyBlockHex: "8bc9d294e44392a18defc5a600db9ccb8c48899cf475609273b776b76ab265aa765732603008991c",
        expectedClientWriteKeyHex: "8bc9d294e44392a18defc5a600db9ccb",
        expectedServerWriteKeyHex: "8c48899cf475609273b776b76ab265aa",
        expectedClientWriteIvHex: "76573260",
        expectedServerWriteIvHex: "3008991c",
        _source:
            "Synthesized via Python ref P_SHA256. Layout per RFC 5246 §6.3 + RFC 6655 §3 (AES-128-CCM-8 AEAD, no MAC keys): 16+16 keys then 4+4 IVs. Seed order is REVERSED vs master_secret (server then client) — see mbedTLS ssl_tls.c v3.6.6 around line 7257 ('Swap the client and server random values').",
    },
    finishedVectors: [
        {
            name: "finished_client_synth",
            masterSecretHex:
                "c7611541a06be48b05e4306ac8296f1b9e99e558cd2f2eb5b957302cfcf9080db0ec1f85f2d22d93e6553edf3c7611e1",
            transcriptDigestHex: "1569137a59279bed898a1e90f1f33cca0896bb16ee167af445a1e1c7e79e27b1",
            role: "client",
            expectedVerifyDataHex: "dc3c0e8082dbf30462fb8a8d",
            _source:
                "Synthesized via Python ref P_SHA256. transcriptDigest = SHA-256(b'dummy handshake messages'); 12-byte output per RFC 5246 §7.4.9.",
        },
        {
            name: "finished_server_synth",
            masterSecretHex:
                "c7611541a06be48b05e4306ac8296f1b9e99e558cd2f2eb5b957302cfcf9080db0ec1f85f2d22d93e6553edf3c7611e1",
            transcriptDigestHex: "1569137a59279bed898a1e90f1f33cca0896bb16ee167af445a1e1c7e79e27b1",
            role: "server",
            expectedVerifyDataHex: "f8ce712f601fd53006b3ff6a",
            _source:
                "Synthesized via Python ref P_SHA256. Same transcript as finished_client_synth, server role swaps the label to 'server finished'.",
        },
    ],
};
