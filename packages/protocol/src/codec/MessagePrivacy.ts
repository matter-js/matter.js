/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    CRYPTO_SYMMETRIC_KEY_LENGTH,
    MaybePromise,
} from "@matter/general";

/** HKDF info string for deriving a privacy key from an encryption key (Matter spec §4.8.2). */
const PRIVACY_KEY_INFO = Bytes.fromString("PrivacyKey");

const NONCE_MIC_OFFSET = CRYPTO_AEAD_MIC_LENGTH_BYTES - 11;
const NONCE_MIC_LENGTH = 11;

/**
 * Matter message privacy (spec §4.8): obfuscation of the packet header for privacy-enhanced messages.
 */
export namespace MessagePrivacy {
    /** Derive a privacy key from an encryption key: HKDF(key, salt=[], info="PrivacyKey", 16). */
    export function deriveKey(crypto: Crypto, encryptionKey: Bytes): MaybePromise<Bytes> {
        return crypto.createHkdfKey(encryptionKey, new Uint8Array(0), PRIVACY_KEY_INFO, CRYPTO_SYMMETRIC_KEY_LENGTH);
    }

    /** Build the 13-byte privacy nonce: sessionId (2 bytes, big-endian) then the last 11 bytes of the message MIC. */
    export function buildNonce(sessionId: number, mic: Bytes): Bytes {
        const micBytes = Bytes.of(mic);
        return Bytes.concat(
            Uint8Array.of((sessionId >> 8) & 0xff, sessionId & 0xff),
            micBytes.slice(NONCE_MIC_OFFSET, NONCE_MIC_OFFSET + NONCE_MIC_LENGTH),
        );
    }

    /**
     * Obfuscate or deobfuscate a header region using AES-CTR (as AES-CCM with empty AAD, ciphertext-only).
     * CTR keystream XOR is symmetric, so the same call serves both directions.
     */
    export function transform(crypto: Crypto, privacyKey: Bytes, data: Bytes, nonce: Bytes): Bytes {
        const dataBytes = Bytes.of(data);
        return Bytes.of(crypto.encrypt(privacyKey, dataBytes, nonce)).slice(0, dataBytes.length);
    }
}
