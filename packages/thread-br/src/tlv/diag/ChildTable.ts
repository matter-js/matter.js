/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mode } from "./Mode.js";

/**
 * One Child Table entry — 3 bytes per OpenThread `ChildTableTlvEntry`:
 *
 *   uint16 BE: [bits 15..11 timeout-exponent][bits 10..9 incoming link quality][bits 8..0 child id]
 *   uint8     : MLE Mode bitmap (same layout as the Mode TLV)
 *
 * `timeout-exponent` 4..31 maps to `2^(exp - 4)` seconds; values <4 clamp to 4
 * per OpenThread `ChildTableTlvEntry::DetermineTimeoutFromExponent`.
 */
export interface ChildTableEntry {
    /** Timeout exponent (4..31) — wire form. {@link timeoutSeconds} is the resolved value. */
    timeoutExponent: number;
    /** Resolved timeout in seconds (`2^(exp-4)`). */
    timeoutSeconds: number;
    incomingLinkQuality: number;
    childId: number;
    mode: Mode;
}

const ENTRY_BYTES = 3;
const TIMEOUT_MASK = 0xf800;
const TIMEOUT_SHIFT = 11;
const ILQ_MASK = 0x0600;
const ILQ_SHIFT = 9;
const CHILD_ID_MASK = 0x01ff;
const TIMEOUT_EXP_MIN = 4;
const TIMEOUT_EXP_MAX = 0x1f;

function clampedExponent(exp: number): number {
    if (exp < TIMEOUT_EXP_MIN) return TIMEOUT_EXP_MIN;
    if (exp > TIMEOUT_EXP_MAX) return TIMEOUT_EXP_MAX;
    return exp;
}

function timeoutFromExponent(exp: number): number {
    return 1 << (clampedExponent(exp) - TIMEOUT_EXP_MIN);
}

export namespace ChildTable {
    export function decode(value: Uint8Array): ChildTableEntry[] {
        if (value.length % ENTRY_BYTES !== 0) {
            throw new Error(`ChildTable TLV length ${value.length} not a multiple of ${ENTRY_BYTES}`);
        }
        const entries = new Array<ChildTableEntry>();
        for (let offset = 0; offset < value.length; offset += ENTRY_BYTES) {
            const word = (value[offset] << 8) | value[offset + 1];
            const timeoutExponent = (word & TIMEOUT_MASK) >> TIMEOUT_SHIFT;
            entries.push({
                timeoutExponent,
                timeoutSeconds: timeoutFromExponent(timeoutExponent),
                incomingLinkQuality: (word & ILQ_MASK) >> ILQ_SHIFT,
                childId: word & CHILD_ID_MASK,
                mode: Mode.decode(value.subarray(offset + 2, offset + 3)),
            });
        }
        return entries;
    }

    export function encode(entries: ReadonlyArray<ChildTableEntry>): Uint8Array {
        const out = new Uint8Array(entries.length * ENTRY_BYTES);
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            if (e.timeoutExponent < 0 || e.timeoutExponent > TIMEOUT_EXP_MAX) {
                throw new Error(`ChildTable timeoutExponent out of range: ${e.timeoutExponent}`);
            }
            if (e.incomingLinkQuality < 0 || e.incomingLinkQuality > 3) {
                throw new Error(`ChildTable incomingLinkQuality out of range: ${e.incomingLinkQuality}`);
            }
            if (e.childId < 0 || e.childId > 0x1ff) {
                throw new Error(`ChildTable childId out of range: ${e.childId}`);
            }
            const word =
                ((e.timeoutExponent << TIMEOUT_SHIFT) & TIMEOUT_MASK) |
                ((e.incomingLinkQuality << ILQ_SHIFT) & ILQ_MASK) |
                (e.childId & CHILD_ID_MASK);
            out[i * ENTRY_BYTES] = (word >> 8) & 0xff;
            out[i * ENTRY_BYTES + 1] = word & 0xff;
            out[i * ENTRY_BYTES + 2] = Mode.encode(e.mode)[0];
        }
        return out;
    }
}
