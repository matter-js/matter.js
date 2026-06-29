/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { AesCmacPrf128 } from "./AesCmacPrf128.js";

const HLEN = 16;

/**
 * PBKDF2 (RFC 8018 §5.2) using AES-CMAC-PRF-128 as the underlying PRF.
 *
 * Hand-rolled because Node's `crypto.pbkdf2` is hardwired to HMAC. The PRF here
 * always emits 16 bytes, so each output block needs one PRF call per iteration.
 */
export function pbkdf2AesCmac(args: {
    password: Uint8Array;
    salt: Uint8Array;
    iterations: number;
    dkLen: number;
}): Uint8Array {
    const { password, salt, iterations, dkLen } = args;
    if (!Number.isInteger(iterations) || iterations <= 0) {
        throw new Error(`iterations must be a positive integer, got ${iterations}`);
    }
    if (!Number.isInteger(dkLen) || dkLen <= 0) {
        throw new Error(`dkLen must be a positive integer, got ${dkLen}`);
    }
    // PBKDF2 caps the derived-key length at (2^32 - 1) * hLen bytes (RFC 8018).
    if (dkLen > 0xffffffff * HLEN) {
        throw new Error(`dkLen ${dkLen} exceeds PBKDF2 maximum`);
    }

    const numBlocks = Math.ceil(dkLen / HLEN);
    const out = new Uint8Array(numBlocks * HLEN);
    const saltedBlock = new Uint8Array(salt.length + 4);
    saltedBlock.set(salt, 0);

    for (let i = 1; i <= numBlocks; i++) {
        saltedBlock[salt.length] = (i >>> 24) & 0xff;
        saltedBlock[salt.length + 1] = (i >>> 16) & 0xff;
        saltedBlock[salt.length + 2] = (i >>> 8) & 0xff;
        saltedBlock[salt.length + 3] = i & 0xff;

        let u = AesCmacPrf128.compute(password, saltedBlock);
        const t = new Uint8Array(u);
        for (let j = 1; j < iterations; j++) {
            u = AesCmacPrf128.compute(password, u);
            for (let k = 0; k < HLEN; k++) t[k] ^= u[k];
        }
        out.set(t, (i - 1) * HLEN);
    }

    return out.subarray(0, dkLen);
}
