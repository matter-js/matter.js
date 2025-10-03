/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, UnexpectedDataError } from "../MatterError.js";

export enum Endian {
    Little,
    Big,
}

/**
 * A standard JS source of bytes.
 *
 * This alias mainly exists because "AllowedSharedBufferSource" is an annoying name.
 */
export type Bytes = AllowSharedBufferSource;

/**
 * A string tag for hex literals.
 *
 * Example: b$`01020304` creates a four-byte Uint8Array.
 */
export function b$(strings: TemplateStringsArray, ...values: unknown[]) {
    if (strings.length === 1 && values.length === 0) {
        return Bytes.fromHex(strings[0]);
    }
    const parts = Array<string>();
    for (let i = 0; i < strings.length; i++) {
        parts.push(strings[i]);
        if (i < values.length) {
            parts.push(`${values[i]}`);
        }
    }
    return Bytes.fromHex(parts.join(""));
}

/**
 * Utility functions for manipulating Uint8Array.
 */
export namespace Bytes {
    export function toHex(array: Bytes) {
        const hexArray = new Array<string>();
        const data = Bytes.of(array);
        hexArray.length = data.length;
        data.forEach(byte => hexArray.push(byte.toString(16).padStart(2, "0")));
        return hexArray.join("");
    }

    export function toBase64(array: Bytes) {
        let result = "";
        const data = Bytes.of(array);
        data.forEach(byte => (result += String.fromCharCode(byte)));
        return btoa(result);
    }

    export function dataViewOf(array: Bytes) {
        const data = Bytes.of(array);
        return new DataView(data.buffer, data.byteOffset, data.byteLength);
    }

    export function areEqual(array1: Bytes, array2: Bytes) {
        if (array1.byteLength !== array2.byteLength) return false;
        const data1 = Bytes.of(array1);
        const data2 = Bytes.of(array2);
        return data1.every((value, index) => data2[index] === value);
    }

    /**
     * Obtain a {@link Uint8Array} for {@link Bytes}.
     */
    export function of(source: Bytes) {
        if (source instanceof Uint8Array) {
            return source;
        }

        if (ArrayBuffer.isView(source)) {
            return new Uint8Array(source.buffer, source.byteLength, source.byteOffset);
        }

        return new Uint8Array(source);
    }

    /**
     * Like {@link of} for the few places where JS differentiates between {@link BufferSource} and
     * {@link SharedBufferSource}.
     *
     * We generally do not deal with shared buffers and this is mostly relevant for security APIs.  So we throw if for
     * some reason the input sourde is not exclusive.
     */
    export function exclusive(source: Bytes) {
        const buffer = "buffer" in source ? source.buffer : source;

        if (buffer[Symbol.toStringTag] !== "ArrayBuffer") {
            throw new ImplementationError("A shared buffer source is not allowed here");
        }

        return source as BufferSource;
    }

    export function isBytes(source: unknown): source is Bytes {
        return source instanceof ArrayBuffer || ArrayBuffer.isView(source);
    }

    export function fromHex(hexString: string): Bytes {
        if (hexString.length === 0) return new Uint8Array(0);
        if (hexString.length % 2 !== 0) throw new UnexpectedDataError("Hex string should have an even length.");
        const bytes = hexString.match(/.{1,2}/g)?.map(byteHex => parseInt(byteHex, 16));
        if (bytes === undefined) throw new UnexpectedDataError("Failed to parse the hex string.");
        return Uint8Array.from(bytes);
    }

    export function fromBase64(base64String: string) {
        const raw = atob(base64String);
        let result = "";
        for (let i = 0; i < raw.length; i++) {
            const hex = raw.charCodeAt(i).toString(16);
            result += hex.length === 2 ? hex : "0" + hex;
        }
        return fromHex(result);
    }

    export function fromString(string: string | Bytes): Bytes {
        if (Bytes.isBytes(string)) {
            return string;
        }

        return new TextEncoder().encode(string);
    }

    export function toString(bytes: string | Bytes): string {
        if (!Bytes.isBytes(bytes)) {
            return bytes;
        }

        return new TextDecoder().decode(bytes);
    }

    export function concat(...arrays: Bytes[]): Bytes {
        let length = 0;
        const data = arrays.map(array => Bytes.of(array));
        data.forEach(array => (length += array.length));
        const result = new Uint8Array(length);
        let offset = 0;
        data.forEach(array => {
            result.set(array, offset);
            offset += array.length;
        });
        return result;
    }

    export function asBigInt(bytes: Bytes) {
        const view = Bytes.dataViewOf(bytes);
        let result = 0n;
        const length = view.byteLength;
        for (let i = 0; i < length; ) {
            const remaining = length - i;
            if (remaining >= 8) {
                result = (result << 64n) + view.getBigUint64(i);
                i += 8;
            } else if (remaining >= 4) {
                result = (result << 32n) + BigInt(view.getUint32(i));
                i += 4;
            } else if (remaining >= 2) {
                result = (result << 16n) + BigInt(view.getUint16(i));
                i += 2;
            } else {
                result = (result << 8n) + BigInt(view.getUint8(i));
                i++;
            }
        }
        return result;
    }

    export const empty = new Uint8Array();
}
