/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Bytes } from "#util/Bytes.js";
import { Aes } from "./Aes.js";
import { WordArray } from "./WordArray.js";

const BLOCK_SIZE = 16;
const RB = 0x87;
const ZERO_BLOCK = new Uint8Array(BLOCK_SIZE);

function aesEcbEncryptBlock(aes: ReturnType<typeof Aes>, block: Uint8Array): Uint8Array {
    // Load 16 bytes big-endian into 4 words, encrypt in place, serialize back big-endian.
    const words = WordArray.fromByteArray(block);
    aes.encrypt(words);
    const out = new Uint8Array(BLOCK_SIZE);
    const view = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) view.setInt32(i * 4, words[i]);
    return out;
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
    for (let i = 0; i < BLOCK_SIZE; i++) target[i] ^= source[offset + i];
}

function generateSubkeys(aes: ReturnType<typeof Aes>): { k1: Uint8Array; k2: Uint8Array } {
    const l = aesEcbEncryptBlock(aes, ZERO_BLOCK);
    const k1 = leftShift1(l);
    if ((l[0] & 0x80) !== 0) k1[BLOCK_SIZE - 1] ^= RB;
    const k2 = leftShift1(k1);
    if ((k1[0] & 0x80) !== 0) k2[BLOCK_SIZE - 1] ^= RB;
    return { k1, k2 };
}

/** AES-CMAC per RFC 4493. 128-bit key, 16-byte tag; empty messages supported. */
export function cmac(key: Uint8Array, message: Uint8Array): Uint8Array {
    if (key.length !== 16) {
        throw new ImplementationError(`AES-CMAC key must be 16 bytes, got ${key.length}`);
    }
    const aes = Aes(Bytes.of(key));
    const { k1, k2 } = generateSubkeys(aes);

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
        x.set(aesEcbEncryptBlock(aes, x));
    }
    xorInto(x, lastBlock);
    return aesEcbEncryptBlock(aes, x);
}
