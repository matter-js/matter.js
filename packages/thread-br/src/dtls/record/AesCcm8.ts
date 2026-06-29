/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCipheriv, createDecipheriv } from "node:crypto";

const KEY_LEN = 16;
const TAG_LEN = 8;

/**
 * AES-128-CCM with an 8-octet authentication tag, the AEAD primitive used by the
 * `TLS_ECJPAKE_WITH_AES_128_CCM_8` cipher suite (RFC 6655 §3, RFC 3610).
 *
 * Wraps Node's `aes-128-ccm` with a fixed 8-byte tag length and returns
 * `ciphertext || tag` to match the wire layout expected by the DTLS record layer.
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

    export function encrypt({ key, nonce, aad, plaintext }: EncryptArgs): Uint8Array {
        if (key.length !== KEY_LEN) {
            throw new Error(`AES-128-CCM-8 key must be ${KEY_LEN} bytes, got ${key.length}`);
        }
        const cipher = createCipheriv("aes-128-ccm", key, nonce, { authTagLength: TAG_LEN });
        cipher.setAAD(aad, { plaintextLength: plaintext.length });
        const body = cipher.update(plaintext);
        const tail = cipher.final();
        const tag = cipher.getAuthTag();

        const out = new Uint8Array(plaintext.length + TAG_LEN);
        out.set(body, 0);
        if (tail.length > 0) {
            out.set(tail, body.length);
        }
        out.set(tag, plaintext.length);
        return out;
    }

    export function decrypt({ key, nonce, aad, ciphertextWithTag }: DecryptArgs): Uint8Array {
        if (key.length !== KEY_LEN) {
            throw new Error(`AES-128-CCM-8 key must be ${KEY_LEN} bytes, got ${key.length}`);
        }
        if (ciphertextWithTag.length < TAG_LEN) {
            throw new Error(`AES-128-CCM-8 input shorter than ${TAG_LEN}-byte tag`);
        }
        const ctLen = ciphertextWithTag.length - TAG_LEN;
        const ct = ciphertextWithTag.subarray(0, ctLen);
        const tag = ciphertextWithTag.subarray(ctLen);

        const decipher = createDecipheriv("aes-128-ccm", key, nonce, { authTagLength: TAG_LEN });
        decipher.setAAD(aad, { plaintextLength: ctLen });
        decipher.setAuthTag(tag);
        const body = decipher.update(ct);
        // CCM .final() throws on tag mismatch; bubble up unchanged.
        const tail = decipher.final();

        const out = new Uint8Array(ctLen);
        out.set(body, 0);
        if (tail.length > 0) {
            out.set(tail, body.length);
        }
        return out;
    }
}
