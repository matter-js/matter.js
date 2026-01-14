/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A 32-bit word array for AES algorithm.
 *
 * Note that we use signed integers so we can use JS bit shifts with signed 32-bit numbers.
 */
export type WordArray = Int32Array;

export function WordArray(length: number): WordArray {
    return new Int32Array(length);
}

const endianConversionView = new DataView(new ArrayBuffer(4));
const endianConversionBytes = new Uint8Array(endianConversionView.buffer);

export namespace WordArray {
    export function fromByteArray(bytes: Uint8Array, alignment = 1) {
        return fromByteView(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), alignment);
    }

    export function fromByteView(bytes: DataView, alignment = 1) {
        const inputBytes = bytes.byteLength;
        const allocWords = Math.ceil(inputBytes / 4 / alignment) * alignment;
        const result = WordArray(allocWords);

        // Convert full words from bytes to words
        let i = 0;
        for (; i + 4 <= inputBytes; i += 4) {
            result[i / 4] = bytes.getInt32(i);
        }

        // If byte array is not aligned to words, compute final word manually
        if (i < inputBytes) {
            result[i / 4] = readPartialWord(bytes, i, inputBytes - i);
        }

        return result;
    }

    /**
     * Copy bytes into a 4-word block.  If the input bytes is too short sets missing bytes to zero.
     */
    export function bytesToBlock(bytes: DataView, block: WordArray, byteOffset?: number) {
        if (byteOffset === undefined) {
            byteOffset = 0;
        }
        for (let i = 0; i < 4; i++, byteOffset += 4) {
            if (byteOffset + 4 <= bytes.byteLength) {
                block[i] = bytes.getInt32(byteOffset);
            } else if (byteOffset >= bytes.byteLength) {
                block[i] = 0;
            } else {
                block[i] = readPartialWord(bytes, byteOffset);
            }
        }
    }

    /**
     * Read a word from a byte array that may be smaller than four bytes.  On little-endian platforms, flips the byte
     * order.
     */
    export function readPartialWord(
        bytes: DataView,
        offset: number,
        bytesAvailable = bytes.byteLength - offset,
    ): number {
        // Write big-endian word to conversion buffer
        for (let i = 0; i < 4; i++) {
            if (i < bytesAvailable) {
                endianConversionBytes[i] = bytes.getUint8(offset + i);
            } else {
                endianConversionBytes[i] = 0;
            }
        }

        // Flip to platform endianness
        return endianConversionView.getUint32(0);
    }

    /**
     * Inverse of {@link writePartialWord}.
     */
    export function writePartialWord(
        word: number,
        bytes: DataView,
        offset: number,
        bytesAvailable = Math.max(bytes.byteLength - offset, 4),
    ) {
        endianConversionView.setUint32(0, word);
        endianConversionBytes[0] = word >>> 24;
        endianConversionBytes[1] = (word >> 16) & 0xff;
        endianConversionBytes[2] = (word >> 8) & 0xff;
        endianConversionBytes[3] = word & 0xff;

        // Buffer is now LE if platform is LE but this will flip
        for (let i = 0; i < bytesAvailable; i++) {
            bytes.setUint8(offset + i, endianConversionBytes[i]);
        }
    }
}
