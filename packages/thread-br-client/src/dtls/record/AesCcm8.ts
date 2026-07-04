/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, InternalError } from "@matter/general";
import { DtlsError } from "../channel/DtlsChannel.js";

const KEY_LEN = 16;
const TAG_LEN = 8;

/**
 * AES-128-CCM with an 8-octet authentication tag, the AEAD primitive used by the
 * `TLS_ECJPAKE_WITH_AES_128_CCM_8` cipher suite (RFC 6655 §3, RFC 3610).
 *
 * Delegates to the matter.js {@link Crypto} abstraction with a fixed 8-byte tag length
 * and returns `ciphertext || tag` to match the wire layout expected by the DTLS record layer.
 *
 * The 12-byte nonce length implies CCM L=3 (15 - 12), giving a 2^24 byte payload
 * limit per record — well above the DTLS 16 KiB record cap.
 */
export namespace AesCcm8 {
    export interface EncryptArgs {
        key: Uint8Array;
        nonce: Uint8Array;
        aad: Uint8Array;
        plaintext: Uint8Array;
    }

    export interface DecryptArgs {
        key: Uint8Array;
        nonce: Uint8Array;
        aad: Uint8Array;
        ciphertextWithTag: Uint8Array;
    }

    export async function encrypt(crypto: Crypto, { key, nonce, aad, plaintext }: EncryptArgs): Promise<Uint8Array> {
        if (key.length !== KEY_LEN) {
            throw new InternalError(`AES-128-CCM-8 key must be ${KEY_LEN} bytes, got ${key.length}`);
        }
        return Bytes.of(crypto.encrypt(key, plaintext, nonce, aad, TAG_LEN));
    }

    export async function decrypt(
        crypto: Crypto,
        { key, nonce, aad, ciphertextWithTag }: DecryptArgs,
    ): Promise<Uint8Array> {
        if (key.length !== KEY_LEN) {
            throw new InternalError(`AES-128-CCM-8 key must be ${KEY_LEN} bytes, got ${key.length}`);
        }
        if (ciphertextWithTag.length < TAG_LEN) {
            throw new DtlsError(`AES-128-CCM-8 input shorter than ${TAG_LEN}-byte tag`);
        }
        return Bytes.of(crypto.decrypt(key, ciphertextWithTag, nonce, aad, TAG_LEN));
    }
}
