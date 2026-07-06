/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto } from "@matter/general";

const ZERO_BLOCK = new Uint8Array(16);

/**
 * AES-CMAC-PRF-128 per RFC 4615: a 16-byte key is used directly; any other length is
 * first compressed via CMAC under an all-zero key. Built on {@link Crypto.cmac}.
 */
export namespace AesCmacPrf128 {
    export function compute(crypto: Crypto, key: Bytes, message: Bytes): Bytes {
        const keyBytes = Bytes.of(key);
        if (keyBytes.length === 16) {
            return crypto.cmac(keyBytes, message);
        }
        const derivedKey = crypto.cmac(ZERO_BLOCK, keyBytes);
        return crypto.cmac(derivedKey, message);
    }
}
