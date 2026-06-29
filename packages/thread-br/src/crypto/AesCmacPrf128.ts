/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCipheriv } from "node:crypto";

const BLOCK_SIZE = 16;
const RB = 0x87;
const ZERO_BLOCK = new Uint8Array(BLOCK_SIZE);

function aesEcbEncryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
    const cipher = createCipheriv("aes-128-ecb", key, null);
    cipher.setAutoPadding(false);
    const out = cipher.update(block);
    cipher.final();
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

function leftShift1(input: Uint8Array): Uint8Array {
    const out = new Uint8Array(input.length);
    let carry = 0;
    for (let i = input.length - 1; i >= 0; i--) {
        const b = input[i];
        out[i] = ((b << 1) & 0xff) | carry;
        carry = (b & 0x80) >> 7;
    }
    return out;
}

function xorInto(target: Uint8Array, source: Uint8Array, offset = 0): void {
    for (let i = 0; i < BLOCK_SIZE; i++) {
        target[i] ^= source[offset + i];
    }
}

function generateSubkeys(key: Uint8Array): { k1: Uint8Array; k2: Uint8Array } {
    const l = aesEcbEncryptBlock(key, ZERO_BLOCK);
    const k1 = leftShift1(l);
    if ((l[0] & 0x80) !== 0) k1[BLOCK_SIZE - 1] ^= RB;
    const k2 = leftShift1(k1);
    if ((k1[0] & 0x80) !== 0) k2[BLOCK_SIZE - 1] ^= RB;
    return { k1, k2 };
}

/**
 * AES-CMAC per RFC 4493.
 *
 * Block-cipher-based MAC with a 128-bit AES key and a 16-byte tag. Empty messages
 * are explicitly supported and pad to a single all-zero block XORed with K2.
 */
export namespace AesCmac {
    export function compute(key: Uint8Array, message: Uint8Array): Uint8Array {
        if (key.length !== 16) {
            throw new Error(`AES-CMAC key must be 16 bytes, got ${key.length}`);
        }
        const { k1, k2 } = generateSubkeys(key);

        const numBlocks = Math.max(1, Math.ceil(message.length / BLOCK_SIZE));
        const lastBlockComplete = message.length > 0 && message.length % BLOCK_SIZE === 0;

        const lastBlock = new Uint8Array(BLOCK_SIZE);
        const lastBlockOffset = (numBlocks - 1) * BLOCK_SIZE;
        if (lastBlockComplete) {
            lastBlock.set(message.subarray(lastBlockOffset, lastBlockOffset + BLOCK_SIZE));
            xorInto(lastBlock, k1);
        } else {
            const remaining = message.length - lastBlockOffset;
            lastBlock.set(message.subarray(lastBlockOffset, lastBlockOffset + remaining));
            lastBlock[remaining] = 0x80;
            xorInto(lastBlock, k2);
        }

        const x = new Uint8Array(BLOCK_SIZE);
        for (let i = 0; i < numBlocks - 1; i++) {
            xorInto(x, message, i * BLOCK_SIZE);
            const enc = aesEcbEncryptBlock(key, x);
            x.set(enc);
        }
        xorInto(x, lastBlock);
        return aesEcbEncryptBlock(key, x);
    }
}

/**
 * AES-CMAC-PRF-128 per RFC 4615.
 *
 * Lifts AES-CMAC into a variable-length-key PRF: a 16-byte key is used directly,
 * any other key is first compressed via CMAC under an all-zero key.
 */
export namespace AesCmacPrf128 {
    export function compute(key: Uint8Array, message: Uint8Array): Uint8Array {
        if (key.length === 16) {
            return AesCmac.compute(key, message);
        }
        const derivedKey = AesCmac.compute(ZERO_BLOCK, key);
        return AesCmac.compute(derivedKey, message);
    }
}
