/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, InternalError } from "@matter/general";
import { ThreadDiagError } from "../../diagnostic/errors.js";

/**
 * Decoded MLE Counters TLV (Network Diagnostic TLV type 34).
 *
 * Field layout per OpenThread `MleCountersTlv`:
 *
 *   9 × uint16 BE  — role-entry counters and partition/parent change counters
 *   6 × uint64 BE  — millisecond accumulators per role
 *
 * Total 66 bytes.
 *
 * The 64-bit time accumulators are exposed as JS `bigint` to keep the full
 * range without precision loss (uptime in ms can exceed 2^53 over years of
 * runtime).
 */
export interface MleCounters {
    disabledRole: number;
    detachedRole: number;
    childRole: number;
    routerRole: number;
    leaderRole: number;
    attachAttempts: number;
    partitionIdChanges: number;
    betterPartitionAttachAttempts: number;
    parentChanges: number;
    trackedTime: bigint;
    disabledTime: bigint;
    detachedTime: bigint;
    childTime: bigint;
    routerTime: bigint;
    leaderTime: bigint;
}

type U16Key =
    | "disabledRole"
    | "detachedRole"
    | "childRole"
    | "routerRole"
    | "leaderRole"
    | "attachAttempts"
    | "partitionIdChanges"
    | "betterPartitionAttachAttempts"
    | "parentChanges";

type U64Key = "trackedTime" | "disabledTime" | "detachedTime" | "childTime" | "routerTime" | "leaderTime";

const U16_FIELDS: ReadonlyArray<U16Key> = [
    "disabledRole",
    "detachedRole",
    "childRole",
    "routerRole",
    "leaderRole",
    "attachAttempts",
    "partitionIdChanges",
    "betterPartitionAttachAttempts",
    "parentChanges",
];

const U64_FIELDS: ReadonlyArray<U64Key> = [
    "trackedTime",
    "disabledTime",
    "detachedTime",
    "childTime",
    "routerTime",
    "leaderTime",
];

const TOTAL_BYTES = U16_FIELDS.length * 2 + U64_FIELDS.length * 8;
const U64_OFFSET = U16_FIELDS.length * 2;

function readU16BE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 8) | bytes[offset + 1];
}

function writeU16BE(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = (value >> 8) & 0xff;
    bytes[offset + 1] = value & 0xff;
}

function readU64BE(bytes: Uint8Array, offset: number): bigint {
    let result = 0n;
    for (let i = 0; i < 8; i++) {
        result = (result << 8n) | BigInt(bytes[offset + i]);
    }
    return result;
}

function writeU64BE(bytes: Uint8Array, offset: number, value: bigint): void {
    for (let i = 7; i >= 0; i--) {
        bytes[offset + i] = Number(value & 0xffn);
        value >>= 8n;
    }
}

const U64_MAX = (1n << 64n) - 1n;

export namespace MleCounters {
    export function decode(value: Bytes): MleCounters {
        const buf = Bytes.of(value);
        if (buf.length !== TOTAL_BYTES) {
            throw new ThreadDiagError(`MleCounters TLV must be ${TOTAL_BYTES} bytes, got ${buf.length}`);
        }
        return {
            disabledRole: readU16BE(buf, 0),
            detachedRole: readU16BE(buf, 2),
            childRole: readU16BE(buf, 4),
            routerRole: readU16BE(buf, 6),
            leaderRole: readU16BE(buf, 8),
            attachAttempts: readU16BE(buf, 10),
            partitionIdChanges: readU16BE(buf, 12),
            betterPartitionAttachAttempts: readU16BE(buf, 14),
            parentChanges: readU16BE(buf, 16),
            trackedTime: readU64BE(buf, 18),
            disabledTime: readU64BE(buf, 26),
            detachedTime: readU64BE(buf, 34),
            childTime: readU64BE(buf, 42),
            routerTime: readU64BE(buf, 50),
            leaderTime: readU64BE(buf, 58),
        };
    }

    export function encode(counters: MleCounters): Bytes {
        const out = new Uint8Array(TOTAL_BYTES);
        for (let i = 0; i < U16_FIELDS.length; i++) {
            const v = counters[U16_FIELDS[i]];
            if (!Number.isInteger(v) || v < 0 || v > 0xffff) {
                throw new InternalError(`MleCounters.${U16_FIELDS[i]} out of range: ${v}`);
            }
            writeU16BE(out, i * 2, v);
        }
        for (let i = 0; i < U64_FIELDS.length; i++) {
            const v = counters[U64_FIELDS[i]];
            if (typeof v !== "bigint" || v < 0n || v > U64_MAX) {
                throw new InternalError(`MleCounters.${U64_FIELDS[i]} out of range: ${v}`);
            }
            writeU64BE(out, U64_OFFSET + i * 8, v);
        }
        return out;
    }
}
