/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError, MatterError } from "@matter/general";

/** Low-level MeshCoP/base TLV codec parse failure (truncated stream, bad length, ...). */
export class ThreadTlvError extends MatterError {}

/**
 * MeshCoP TLV stream (Thread spec §8.10) is a sequence of [type:1][length:1][value:length] frames.
 * Length 0xFF escapes to a 2-byte big-endian extended length following the type byte.
 */
export interface BasicTlvEntry {
    type: number;
    value: Bytes;
}

export namespace BasicTlv {
    export function walk(blob: Bytes): BasicTlvEntry[] {
        const buf = Bytes.of(blob);
        const out = new Array<BasicTlvEntry>();
        let offset = 0;
        while (offset < buf.length) {
            if (offset + 2 > buf.length) {
                throw new ThreadTlvError(`Truncated TLV header at offset ${offset}`);
            }
            const type = buf[offset];
            const lenByte = buf[offset + 1];
            let length: number;
            let valueStart: number;
            if (lenByte === 0xff) {
                if (offset + 4 > buf.length) {
                    throw new ThreadTlvError(`Truncated extended-length TLV header at offset ${offset}`);
                }
                length = (buf[offset + 2] << 8) | buf[offset + 3];
                valueStart = offset + 4;
            } else {
                length = lenByte;
                valueStart = offset + 2;
            }
            const valueEnd = valueStart + length;
            if (valueEnd > buf.length) {
                throw new ThreadTlvError(`Truncated TLV value at offset ${offset} (type=${type}, length=${length})`);
            }
            out.push({ type, value: buf.slice(valueStart, valueEnd) });
            offset = valueEnd;
        }
        return out;
    }

    export function encode(entries: ReadonlyArray<BasicTlvEntry>): Bytes {
        let totalLength = 0;
        for (const entry of entries) {
            if (!Number.isInteger(entry.type) || entry.type < 0 || entry.type > 0xff) {
                throw new InternalError(`Invalid TLV type ${entry.type}: must be 0..255`);
            }
            const valueLen = Bytes.of(entry.value).length;
            if (valueLen > 0xffff) {
                throw new InternalError(`Invalid TLV length ${valueLen}: must be <= 0xFFFF`);
            }
            totalLength += valueLen + (valueLen >= 0xff ? 4 : 2);
        }

        const out = new Uint8Array(totalLength);
        let offset = 0;
        for (const entry of entries) {
            const value = Bytes.of(entry.value);
            const valueLen = value.length;
            out[offset++] = entry.type;
            if (valueLen >= 0xff) {
                out[offset++] = 0xff;
                out[offset++] = (valueLen >> 8) & 0xff;
                out[offset++] = valueLen & 0xff;
            } else {
                out[offset++] = valueLen;
            }
            out.set(value, offset);
            offset += valueLen;
        }
        return out;
    }
}
