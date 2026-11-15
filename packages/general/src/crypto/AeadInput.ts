/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES,
    CRYPTO_AEAD_NONCE_LENGTHS_BYTES,
    cryptoAeadMaxPlaintextLength,
} from "./CryptoConstants.js";
import { CryptoInputError } from "./CryptoError.js";

/**
 * Refuse AES-CCM input outside the limits matter.js supports, so every {@link Crypto} implementation throws
 * {@link CryptoInputError} for the same input.
 *
 * @param plaintextLength the plaintext length; for decryption the ciphertext length minus the tag length
 */
export function assertAeadInput({
    nonceLength,
    tagLength,
    aadLength,
    plaintextLength,
}: {
    nonceLength: number;
    tagLength: number;
    aadLength: number;
    plaintextLength: number;
}) {
    if (!CRYPTO_AEAD_NONCE_LENGTHS_BYTES.includes(nonceLength)) {
        throw new CryptoInputError(
            `Nonce must be ${CRYPTO_AEAD_NONCE_LENGTHS_BYTES.join(" or ")} bytes, got ${nonceLength}`,
        );
    }

    // NIST SP 800-38C permits an even tag length in [4, 16]; anything else corrupts the flag byte or truncates the tag
    if (tagLength < 4 || tagLength > 16 || tagLength % 2 !== 0) {
        throw new CryptoInputError("Tag length must be an even value between 4 and 16 bytes");
    }

    if (aadLength > CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES) {
        throw new CryptoInputError(`Associated data exceeds maximum length of ${CRYPTO_AEAD_MAX_AAD_LENGTH_BYTES}`);
    }

    if (plaintextLength < 0) {
        throw new CryptoInputError(`Cannot decrypt ciphertext shorter than tag length of ${tagLength}`);
    }

    const maxPlaintextLength = cryptoAeadMaxPlaintextLength(nonceLength);
    if (plaintextLength > maxPlaintextLength) {
        throw new CryptoInputError(`Plaintext exceeds maximum length of ${maxPlaintextLength} bytes`);
    }
}
