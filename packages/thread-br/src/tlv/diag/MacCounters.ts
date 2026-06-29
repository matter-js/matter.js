/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoded MAC Counters TLV (Network Diagnostic TLV type 9).
 *
 * Field layout per OpenThread `MacCountersTlv` (`network_diagnostic_tlvs.hpp`)
 * — nine consecutive big-endian uint32 fields, total 36 bytes. Field names
 * mirror the SNMP-style RFC 2233 names used by OpenThread.
 */
export interface MacCounters {
    ifInUnknownProtos: number;
    ifInErrors: number;
    ifOutErrors: number;
    ifInUcastPkts: number;
    ifInBroadcastPkts: number;
    ifInDiscards: number;
    ifOutUcastPkts: number;
    ifOutBroadcastPkts: number;
    ifOutDiscards: number;
}

const FIELD_COUNT = 9;
const TOTAL_BYTES = FIELD_COUNT * 4;

const FIELD_ORDER: ReadonlyArray<keyof MacCounters> = [
    "ifInUnknownProtos",
    "ifInErrors",
    "ifOutErrors",
    "ifInUcastPkts",
    "ifInBroadcastPkts",
    "ifInDiscards",
    "ifOutUcastPkts",
    "ifOutBroadcastPkts",
    "ifOutDiscards",
];

function readU32BE(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU32BE(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}

export namespace MacCounters {
    export function decode(value: Uint8Array): MacCounters {
        if (value.length !== TOTAL_BYTES) {
            throw new Error(`MacCounters TLV must be ${TOTAL_BYTES} bytes, got ${value.length}`);
        }
        return {
            ifInUnknownProtos: readU32BE(value, 0),
            ifInErrors: readU32BE(value, 4),
            ifOutErrors: readU32BE(value, 8),
            ifInUcastPkts: readU32BE(value, 12),
            ifInBroadcastPkts: readU32BE(value, 16),
            ifInDiscards: readU32BE(value, 20),
            ifOutUcastPkts: readU32BE(value, 24),
            ifOutBroadcastPkts: readU32BE(value, 28),
            ifOutDiscards: readU32BE(value, 32),
        };
    }

    export function encode(counters: MacCounters): Uint8Array {
        const out = new Uint8Array(TOTAL_BYTES);
        for (let i = 0; i < FIELD_ORDER.length; i++) {
            const v = counters[FIELD_ORDER[i]];
            if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) {
                throw new Error(`MacCounters.${FIELD_ORDER[i]} out of range: ${v}`);
            }
            writeU32BE(out, i * 4, v);
        }
        return out;
    }
}
