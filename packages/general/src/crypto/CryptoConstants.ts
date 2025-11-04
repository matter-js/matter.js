/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const MATTER_CRYPTO_PRIMITIVES_VERSION = 1;

/** @see {@link MatterSpecification.v10.Core} § 3.5.1 */
export const CRYPTO_GROUP_SIZE_BITS = 256;
export const CRYPTO_GROUP_SIZE_BYTES = 32;
export const CRYPTO_PUBLIC_KEY_SIZE_BYTES = 2 * CRYPTO_GROUP_SIZE_BYTES + 1;
/** @see {@link MatterSpecification.v10.Core} § 3.3 */
export const CRYPTO_HASH_LEN_BYTES = 32;
export const CRYPTO_HASH_BLOCK_LEN_BYTES = 64;
/** @see {@link MatterSpecification.v10.Core} § 3.6 */
export const CRYPTO_SYMMETRIC_KEY_LENGTH_BITS = 128;
export const CRYPTO_SYMMETRIC_KEY_LENGTH_BYTES = 16;
export const CRYPTO_AEAD_MIC_LENGTH_BITS = 128;
export const CRYPTO_AEAD_MIC_LENGTH_BYTES = 16;
export const CRYPTO_AEAD_NONCE_LENGTH_BYTES = 13;
