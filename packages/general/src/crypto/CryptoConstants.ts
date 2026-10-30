/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const MATTER_CRYPTO_PRIMITIVES_VERSION = 1;

/** @see {@link MatterSpecification.v161.Core} § 3.5.1 */
export const CRYPTO_GROUP_SIZE_BITS = 256;
export const CRYPTO_GROUP_SIZE_BYTES = 32;
export const CRYPTO_PUBLIC_KEY_SIZE_BYTES = 2 * CRYPTO_GROUP_SIZE_BYTES + 1;
/** @see {@link MatterSpecification.v161.Core} § 3.3 */
export const CRYPTO_HASH_LEN_BYTES = 32;
/** @see {@link MatterSpecification.v161.Core} § 3.6 */
export const CRYPTO_SYMMETRIC_KEY_LENGTH_BITS = 128;
export const CRYPTO_SYMMETRIC_KEY_LENGTH_BYTES = 16;
export const CRYPTO_AEAD_MIC_LENGTH_BITS = 128;
export const CRYPTO_AEAD_MIC_LENGTH_BYTES = 16;
export const CRYPTO_AEAD_NONCE_LENGTH_BYTES = 13;

/** The AES-CCM nonce lengths matter.js supports: 13 bytes for Matter, 12 bytes for DTLS. */
export const CRYPTO_AEAD_NONCE_LENGTHS_BYTES: readonly number[] = [12, CRYPTO_AEAD_NONCE_LENGTH_BYTES];

/** The largest AES-CCM AAD matter.js accepts. */
export const CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES = 0xffff;

/**
 * The largest AES-CCM plaintext for a nonce of the given length.  NIST SP 800-38C requires the plaintext length to be
 * below 2^(8L), where L = 15 minus the nonce length is the size of the message length field.
 */
export function cryptoAeadMaxPlaintextLength(nonceLength: number) {
    return 2 ** (8 * (15 - nonceLength)) - 1;
}

/** The largest AES-CCM ciphertext, tag included: {@link cryptoAeadMaxPlaintextLength} plus the tag length. */
export function cryptoAeadMaxCiphertextLength(nonceLength: number, tagLength = CRYPTO_AEAD_MIC_LENGTH_BYTES) {
    return cryptoAeadMaxPlaintextLength(nonceLength) + tagLength;
}

/** The largest AES-CCM ciphertext, MIC included, with Matter's 13-byte nonce and 16-byte MIC. */
export const CRYPTO_AEAD_MAX_CIPHERTEXT_LENGTH_BYTES = cryptoAeadMaxCiphertextLength(CRYPTO_AEAD_NONCE_LENGTH_BYTES);
/** @see {@link MatterSpecification.v161.Core} § 3.7 */
export const CRYPTO_PRIVACY_NONCE_LENGTH_BYTES = CRYPTO_AEAD_NONCE_LENGTH_BYTES;
/** @see {@link MatterSpecification.v161.Core} § 3.9 */
export const CRYPTO_PBKDF_ITERATIONS_MIN = 1000;
export const CRYPTO_PBKDF_ITERATIONS_MAX = 100000;
