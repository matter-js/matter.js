/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Endian } from "./Bytes.js";

/** Reader that auto-increments its offset after each read. */
export class DataReader<E extends Endian = Endian.Big> {
    readonly #littleEndian: boolean;
    readonly #dataView: DataView;
    readonly #buffer: Uint8Array;
    #offset = 0;

    constructor(buffer: Bytes, endian?: E) {
        this.#buffer = Bytes.of(buffer);
        this.#dataView = Bytes.dataViewOf(this.#buffer);
        this.#littleEndian = endian === Endian.Little;
    }

    readUInt8() {
        return this.#dataView.getUint8(this.getOffsetAndAdvance(1));
    }

    readUInt16() {
        return this.#dataView.getUint16(this.getOffsetAndAdvance(2), this.#littleEndian);
    }

    readUInt32() {
        return this.#dataView.getUint32(this.getOffsetAndAdvance(4), this.#littleEndian);
    }

    readUInt64() {
        return this.#dataView.getBigUint64(this.getOffsetAndAdvance(8), this.#littleEndian);
    }

    readInt8() {
        return this.#dataView.getInt8(this.getOffsetAndAdvance(1));
    }

    readInt16() {
        return this.#dataView.getInt16(this.getOffsetAndAdvance(2), this.#littleEndian);
    }

    readInt32() {
        return this.#dataView.getInt32(this.getOffsetAndAdvance(4), this.#littleEndian);
    }

    readInt64() {
        return this.#dataView.getBigInt64(this.getOffsetAndAdvance(8), this.#littleEndian);
    }

    readFloat() {
        return this.#dataView.getFloat32(this.getOffsetAndAdvance(4), this.#littleEndian);
    }

    readDouble() {
        return this.#dataView.getFloat64(this.getOffsetAndAdvance(8), this.#littleEndian);
    }

    readUtf8String(length: number) {
        const offset = this.getOffsetAndAdvance(length);
        return new TextDecoder().decode(this.#buffer.subarray(offset, offset + length));
    }

    readByteArray(length: number) {
        const offset = this.getOffsetAndAdvance(length);
        return this.#buffer.subarray(offset, offset + length);
    }

    get remainingBytesCount() {
        return this.#dataView.byteLength - this.#offset;
    }

    get remainingBytes() {
        return this.#buffer.subarray(this.#offset);
    }

    get length() {
        return this.#dataView.byteLength;
    }

    set offset(offset: number) {
        if (offset > this.#dataView.byteLength) {
            throw new Error(`Offset ${offset} is out of bounds.`);
        }
        this.#offset = offset;
    }

    get offset() {
        return this.#offset;
    }

    private getOffsetAndAdvance(size: number) {
        const result = this.#offset;
        this.#offset += size;
        if (this.#offset > this.#dataView.byteLength) {
            this.#offset = this.#dataView.byteLength;
        }
        return result;
    }
}
