/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import type { Crypto } from "./Crypto.js";

const NONCE_LENGTH = 13;

/**
 * A symmetric cipher for encrypting and decrypting data.
 */
export interface Cipher {
    encrypt(data: Bytes): Bytes;
    decrypt(data: Bytes): Bytes;
}

/**
 * AES-128-CCM cipher using the platform's {@link Crypto} implementation.
 *
 * Storage format: `[13-byte nonce][ciphertext + 16-byte auth tag]`.
 */
export class AesCipher implements Cipher {
    #crypto: Crypto;
    #key: Bytes;

    constructor(crypto: Crypto, key: Bytes) {
        this.#crypto = crypto;
        this.#key = key;
    }

    encrypt(data: Bytes): Bytes {
        const nonce = this.#crypto.randomBytes(NONCE_LENGTH);
        const ciphertext = this.#crypto.encrypt(this.#key, data, nonce);
        const result = new Uint8Array(NONCE_LENGTH + ciphertext.byteLength);
        result.set(Bytes.of(nonce), 0);
        result.set(Bytes.of(ciphertext), NONCE_LENGTH);
        return result;
    }

    decrypt(data: Bytes): Bytes {
        const bytes = Bytes.of(data);
        const nonce = bytes.subarray(0, NONCE_LENGTH);
        const ciphertext = bytes.subarray(NONCE_LENGTH);
        return Bytes.of(this.#crypto.decrypt(this.#key, ciphertext, nonce));
    }
}
