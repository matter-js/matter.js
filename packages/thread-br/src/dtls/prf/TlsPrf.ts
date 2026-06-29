/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHmac } from "node:crypto";

const SHA256_LEN = 32;
const MASTER_SECRET_LEN = 48;
const RANDOM_LEN = 32;
const KEY_LEN = 16;
const IV_LEN = 4;
const KEY_BLOCK_LEN = KEY_LEN * 2 + IV_LEN * 2;
const VERIFY_DATA_LEN = 12;

const ASCII_ENCODER = new TextEncoder();

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
    const hmac = createHmac("sha256", key);
    hmac.update(data);
    return new Uint8Array(hmac.digest());
}

function expectLength(name: string, value: Uint8Array, expected: number): void {
    if (value.length !== expected) {
        throw new Error(`TlsPrf ${name} must be ${expected} bytes, got ${value.length}`);
    }
}

function pSha256(secret: Uint8Array, seed: Uint8Array, outputLength: number): Uint8Array {
    if (outputLength < 0) {
        throw new Error(`TlsPrf outputLength must be non-negative, got ${outputLength}`);
    }
    const out = new Uint8Array(outputLength);
    if (outputLength === 0) {
        return out;
    }
    let a = hmacSha256(secret, seed);
    const block = new Uint8Array(SHA256_LEN + seed.length);
    block.set(seed, SHA256_LEN);
    let written = 0;
    while (written < outputLength) {
        block.set(a, 0);
        const next = hmacSha256(secret, block);
        const remaining = outputLength - written;
        const copyLen = Math.min(SHA256_LEN, remaining);
        out.set(next.subarray(0, copyLen), written);
        written += copyLen;
        if (written < outputLength) {
            a = hmacSha256(secret, a);
        }
    }
    return out;
}

/**
 * TLS 1.2 pseudo-random function (RFC 5246 §5) using HMAC-SHA256 — the only PRF
 * permitted for `TLS_ECJPAKE_WITH_AES_128_CCM_8` (RFC 6655 §3). Mirrors mbedTLS
 * v3.6.6 `tls_prf_sha256` / `tls_prf_generic`.
 *
 * Internal to `dtls/`; not re-exported from the package public API surface.
 */
export namespace TlsPrf {
    /**
     * P_SHA256 expansion as defined in RFC 5246 §5:
     *
     *   P_hash(secret, seed) = HMAC_hash(secret, A(1) || seed) ||
     *                          HMAC_hash(secret, A(2) || seed) || ...
     *
     * with `A(0) = seed`, `A(i) = HMAC_hash(secret, A(i-1))`. The TLS 1.2 PRF
     * over (label, seed) is `P_SHA256(secret, label || seed)` — label bytes are
     * concatenated with the seed (no length prefix). The label is ASCII per
     * RFC 5246; we encode it as UTF-8 which coincides for ASCII-only input.
     */
    export function compute(args: {
        secret: Uint8Array;
        label: string;
        seed: Uint8Array;
        outputLength: number;
    }): Uint8Array {
        const { secret, label, seed, outputLength } = args;
        const labelBytes = ASCII_ENCODER.encode(label);
        const combined = new Uint8Array(labelBytes.length + seed.length);
        combined.set(labelBytes, 0);
        combined.set(seed, labelBytes.length);
        return pSha256(secret, combined, outputLength);
    }

    /**
     * `master_secret = PRF(pre_master_secret, "master secret",
     *                      ClientHello.random || ServerHello.random)[0..47]`
     * (RFC 5246 §8.1).
     */
    export function masterSecret(args: {
        premasterSecret: Uint8Array;
        clientRandom: Uint8Array;
        serverRandom: Uint8Array;
    }): Uint8Array {
        const { premasterSecret, clientRandom, serverRandom } = args;
        expectLength("clientRandom", clientRandom, RANDOM_LEN);
        expectLength("serverRandom", serverRandom, RANDOM_LEN);
        const seed = new Uint8Array(RANDOM_LEN * 2);
        seed.set(clientRandom, 0);
        seed.set(serverRandom, RANDOM_LEN);
        return compute({ secret: premasterSecret, label: "master secret", seed, outputLength: MASTER_SECRET_LEN });
    }

    /**
     * Slices of the 40-byte key block for `TLS_ECJPAKE_WITH_AES_128_CCM_8`
     * (AEAD, no MAC keys; RFC 6655 §3, RFC 5246 §6.3).
     */
    export interface KeyBlock {
        clientWriteKey: Uint8Array;
        serverWriteKey: Uint8Array;
        clientWriteIv: Uint8Array;
        serverWriteIv: Uint8Array;
    }

    /**
     * `key_block = PRF(master_secret, "key expansion",
     *                  ServerHello.random || ClientHello.random)[0..39]`
     * (RFC 5246 §6.3). Note the seed order is REVERSED relative to
     * {@link masterSecret} (server then client) — see mbedTLS ssl_tls.c v3.6.6
     * "Swap the client and server random values" (RFC 5246 6.3 vs 8.1).
     *
     * For `TLS_ECJPAKE_WITH_AES_128_CCM_8` the layout is:
     * `client_write_key (16) || server_write_key (16) ||
     *  client_write_IV (4)  || server_write_IV (4)`.
     */
    export function keyBlock(args: {
        masterSecret: Uint8Array;
        clientRandom: Uint8Array;
        serverRandom: Uint8Array;
    }): KeyBlock {
        const { masterSecret: ms, clientRandom, serverRandom } = args;
        expectLength("masterSecret", ms, MASTER_SECRET_LEN);
        expectLength("clientRandom", clientRandom, RANDOM_LEN);
        expectLength("serverRandom", serverRandom, RANDOM_LEN);
        const seed = new Uint8Array(RANDOM_LEN * 2);
        seed.set(serverRandom, 0);
        seed.set(clientRandom, RANDOM_LEN);
        const block = compute({ secret: ms, label: "key expansion", seed, outputLength: KEY_BLOCK_LEN });
        return {
            clientWriteKey: block.slice(0, KEY_LEN),
            serverWriteKey: block.slice(KEY_LEN, KEY_LEN * 2),
            clientWriteIv: block.slice(KEY_LEN * 2, KEY_LEN * 2 + IV_LEN),
            serverWriteIv: block.slice(KEY_LEN * 2 + IV_LEN, KEY_BLOCK_LEN),
        };
    }

    /**
     * Finished `verify_data` (RFC 5246 §7.4.9):
     *
     *   verify_data = PRF(master_secret, finished_label,
     *                     Hash(handshake_messages))[0..11]
     *
     * with `finished_label = "client finished"` for the client-sent Finished
     * and `"server finished"` for the server-sent one.
     */
    export function verifyData(args: {
        masterSecret: Uint8Array;
        role: "client" | "server";
        transcriptDigest: Uint8Array;
    }): Uint8Array {
        const { masterSecret: ms, role, transcriptDigest } = args;
        expectLength("masterSecret", ms, MASTER_SECRET_LEN);
        expectLength("transcriptDigest", transcriptDigest, SHA256_LEN);
        const label = role === "client" ? "client finished" : "server finished";
        return compute({ secret: ms, label, seed: transcriptDigest, outputLength: VERIFY_DATA_LEN });
    }
}
