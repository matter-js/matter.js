/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MeshCoP TLV stream (Thread spec §8.10) is a sequence of [type:1][length:1][value:length] frames.
 * Length 0xFF escapes to a 2-byte big-endian extended length following the type byte.
 */
export interface BasicTlvEntry {
    type: number;
    value: Uint8Array;
}

export namespace BasicTlv {
    export function walk(blob: Uint8Array): BasicTlvEntry[] {
        const out = new Array<BasicTlvEntry>();
        let offset = 0;
        while (offset < blob.length) {
            if (offset + 2 > blob.length) {
                throw new Error(`Truncated TLV header at offset ${offset}`);
            }
            const type = blob[offset];
            const lenByte = blob[offset + 1];
            let length: number;
            let valueStart: number;
            if (lenByte === 0xff) {
                if (offset + 4 > blob.length) {
                    throw new Error(`Truncated extended-length TLV header at offset ${offset}`);
                }
                length = (blob[offset + 2] << 8) | blob[offset + 3];
                valueStart = offset + 4;
            } else {
                length = lenByte;
                valueStart = offset + 2;
            }
            const valueEnd = valueStart + length;
            if (valueEnd > blob.length) {
                throw new Error(`Truncated TLV value at offset ${offset} (type=${type}, length=${length})`);
            }
            out.push({ type, value: blob.slice(valueStart, valueEnd) });
            offset = valueEnd;
        }
        return out;
    }

    export function encode(entries: ReadonlyArray<BasicTlvEntry>): Uint8Array {
        let totalLength = 0;
        for (const entry of entries) {
            if (!Number.isInteger(entry.type) || entry.type < 0 || entry.type > 0xff) {
                throw new Error(`Invalid TLV type ${entry.type}: must be 0..255`);
            }
            const valueLen = entry.value.length;
            if (valueLen > 0xffff) {
                throw new Error(`Invalid TLV length ${valueLen}: must be <= 0xFFFF`);
            }
            totalLength += valueLen + (valueLen >= 0xff ? 4 : 2);
        }

        const out = new Uint8Array(totalLength);
        let offset = 0;
        for (const entry of entries) {
            const valueLen = entry.value.length;
            out[offset++] = entry.type;
            if (valueLen >= 0xff) {
                out[offset++] = 0xff;
                out[offset++] = (valueLen >> 8) & 0xff;
                out[offset++] = valueLen & 0xff;
            } else {
                out[offset++] = valueLen;
            }
            out.set(entry.value, offset);
            offset += valueLen;
        }
        return out;
    }
}
