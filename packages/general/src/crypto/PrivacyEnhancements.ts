/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "../util/Bytes.js";
import type { Crypto } from "./Crypto.js";
import { CRYPTO_AEAD_MIC_LENGTH_BYTES, CRYPTO_SYMMETRIC_KEY_LENGTH_BYTES } from "./CryptoConstants.js";
import { StandardCrypto } from "./StandardCrypto.js";

const PRIVACY_KEY_INFO = Bytes.fromString("PrivacyKey");
const NONCE_MIC_OFFSET = CRYPTO_AEAD_MIC_LENGTH_BYTES - 11;
const NONCE_MIC_LENGTH = 11;

let defaultCrypto: Crypto;

function getDefaultCrypto(): Crypto {
    if (!defaultCrypto) {
        defaultCrypto = new StandardCrypto();
    }
    return defaultCrypto;
}

/**
 * Privacy enhancement primitives for Matter message obfuscation (spec §4.8).
 * Low-level cryptographic operations for header privacy.
 */
export class PrivacyEnhancements {
    /**
     * Derive a privacy key from an encryption key using HKDF.
     * Produces a 16-byte key suitable for AES-CTR obfuscation.
     */
    static async derivePrivacyKey(operationalKey: Bytes, crypto?: Crypto): Promise<Bytes> {
        const cryptoImpl = crypto ?? getDefaultCrypto();
        const salt = new Uint8Array(0);
        return await cryptoImpl.createHkdfKey(
            operationalKey,
            salt,
            PRIVACY_KEY_INFO,
            CRYPTO_SYMMETRIC_KEY_LENGTH_BYTES,
        );
    }

    /**
     * Build a 13-byte privacy nonce from session ID and full message MIC.
     * Format: sessionId (2 bytes, big-endian) + last 11 bytes of MIC.
     */
    static buildPrivacyNonce(sessionId: number, fullMic: Bytes): Bytes {
        const micBytes = Bytes.of(fullMic);
        if (micBytes.length !== CRYPTO_AEAD_MIC_LENGTH_BYTES) {
            throw new Error(
                `Privacy nonce requires a ${CRYPTO_AEAD_MIC_LENGTH_BYTES}-byte MIC, got ${micBytes.length}`,
            );
        }
        return Bytes.concat(
            Uint8Array.of((sessionId >> 8) & 0xff, sessionId & 0xff),
            micBytes.slice(NONCE_MIC_OFFSET, NONCE_MIC_OFFSET + NONCE_MIC_LENGTH),
        );
    }

    /**
     * Apply privacy transform (obfuscation or deobfuscation) to a region.
     * AES-CTR is symmetric, so the same operation reverses itself.
     */
    static privacyTransform(privacyKey: Bytes, privacyNonce: Bytes, region: Bytes, crypto?: Crypto): Bytes {
        const cryptoImpl = crypto ?? getDefaultCrypto();
        const encrypted = cryptoImpl.encrypt(privacyKey, region, privacyNonce, new Uint8Array(0));
        const encryptedBytes = Bytes.of(encrypted);
        return encryptedBytes.slice(0, Bytes.of(region).length);
    }
}
