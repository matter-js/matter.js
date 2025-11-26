/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, hex, InternalError } from "#index.js";

/**
 * Convert an array of test vector sets to objects.
 */
export function* vectorsOf(source: [string, string, string][]) {
    for (const [key, plaintext, ciphertext] of source) {
        yield {
            key: expandBitVector(key),
            plaintext: expandBitVector(plaintext),
            ciphertext: expandBitVector(ciphertext),
        };
    }
}

/**
 * Serialize an AES bit vector with compression for common patterns, just to save (many) bytes in git.
 *
 * Used for codegen when designing tests.  Included here for future use.
 */
export function compressBitVector(vector: string) {
    const result = compress();

    const verify = Bytes.toHex(expandBitVector(result));
    if (verify !== vector) {
        throw new InternalError("Bit vector compression/decompression error");
    }

    return result;

    function compress() {
        const bitlen = BigInt(vector.length * 4);
        if (vector.match(/^0+$/)) {
            return `W${hex.byte(bitlen / 8n)}`;
        }

        const bigint = BigInt(`0x${vector}`);

        let i = 0n;

        for (; i < bitlen && !(bigint & (1n << i)); i++);
        const bits = bitlen - i;
        for (; i < bitlen && bigint & (1n << i); i++);

        if (i === bitlen) {
            return `W${hex.byte(bitlen / 8n)}T${hex.byte(bits)}`;
        }

        return vector;
    }
}

/**
 * Expand a compressed bit vector into a byte array.
 */
export function expandBitVector(vector: string) {
    const compressionFields = vector.match(/^W([\da-f]+)(?:T([\da-f]+))?$/);
    if (compressionFields) {
        const bitlen = Number.parseInt(compressionFields[1], 16) * 8;
        const result = new Uint8Array(bitlen / 8);
        if (compressionFields[2] !== undefined) {
            const bits = Number.parseInt(compressionFields[2], 16);
            for (let bit = 0; bit < bits; bit++) {
                const byte = Math.floor(bit / 8);
                result[byte] |= 1 << (8 - (bit % 8) - 1);
            }
        }
        return result;
    }
    return Bytes.of(Bytes.fromHex(vector));
}
