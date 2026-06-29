/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoded Connectivity TLV (Network Diagnostic TLV type 4).
 *
 * Layout per OpenThread `mle_tlvs.hpp` `ConnectivityTlvValue` and
 * `mle_tlvs.cpp` `ConnectivityTlvValue::ParseFrom`:
 *
 *   [0]     flags        bits 7..6 = parent priority (signed 2-bit), 5..0 reserved
 *   [1]     linkQuality3 number of neighbors with link quality 3
 *   [2]     linkQuality2 number of neighbors with link quality 2
 *   [3]     linkQuality1 number of neighbors with link quality 1
 *   [4]     leaderCost
 *   [5]     idSequence
 *   [6]     activeRouters
 *   [7..8]  sedBufferSize     uint16 BE   (optional)
 *   [9]     sedDatagramCount  uint8       (optional)
 *
 * The trailing 3 bytes are optional and are included as a pair-and-byte; if
 * absent the spec defaults are 1280 / 1.
 *
 * Parent priority encoding (`Preference::From2BitUint`):
 *   0b01 (1) = high (+1), 0b00 (0) = medium (0),
 *   0b11 (3) = low (-1),  0b10 (2) = reserved-high mapped to medium per RFC-4191.
 */
export type ParentPriority = -1 | 0 | 1;

export interface Connectivity {
    parentPriority: ParentPriority;
    linkQuality3: number;
    linkQuality2: number;
    linkQuality1: number;
    leaderCost: number;
    idSequence: number;
    activeRouters: number;
    sedBufferSize: number;
    sedDatagramCount: number;
}

const FLAGS_PARENT_PRIORITY_MASK = 0xc0;
const FLAGS_PARENT_PRIORITY_SHIFT = 6;
const MIN_SIZE = 7;
const FULL_SIZE = 10;
const DEFAULT_SED_BUFFER_SIZE = 1280;
const DEFAULT_SED_DATAGRAM_COUNT = 1;

function parentPriorityFrom2Bit(raw: number): ParentPriority {
    switch (raw & 0x3) {
        case 0b01:
            return 1;
        case 0b11:
            return -1;
        default:
            return 0;
    }
}

function parentPriorityTo2Bit(prio: ParentPriority): number {
    switch (prio) {
        case 1:
            return 0b01;
        case -1:
            return 0b11;
        default:
            return 0b00;
    }
}

export namespace Connectivity {
    export function decode(value: Uint8Array): Connectivity {
        if (value.length !== MIN_SIZE && value.length !== FULL_SIZE) {
            throw new Error(`Connectivity TLV must be ${MIN_SIZE} or ${FULL_SIZE} bytes, got ${value.length}`);
        }
        const priorityBits = (value[0] & FLAGS_PARENT_PRIORITY_MASK) >> FLAGS_PARENT_PRIORITY_SHIFT;
        const partial: Connectivity = {
            parentPriority: parentPriorityFrom2Bit(priorityBits),
            linkQuality3: value[1],
            linkQuality2: value[2],
            linkQuality1: value[3],
            leaderCost: value[4],
            idSequence: value[5],
            activeRouters: value[6],
            sedBufferSize: DEFAULT_SED_BUFFER_SIZE,
            sedDatagramCount: DEFAULT_SED_DATAGRAM_COUNT,
        };
        if (value.length === FULL_SIZE) {
            partial.sedBufferSize = (value[7] << 8) | value[8];
            partial.sedDatagramCount = value[9];
        }
        return partial;
    }

    export function encode(c: Connectivity): Uint8Array {
        const out = new Uint8Array(FULL_SIZE);
        out[0] = (parentPriorityTo2Bit(c.parentPriority) << FLAGS_PARENT_PRIORITY_SHIFT) & FLAGS_PARENT_PRIORITY_MASK;
        out[1] = c.linkQuality3 & 0xff;
        out[2] = c.linkQuality2 & 0xff;
        out[3] = c.linkQuality1 & 0xff;
        out[4] = c.leaderCost & 0xff;
        out[5] = c.idSequence & 0xff;
        out[6] = c.activeRouters & 0xff;
        out[7] = (c.sedBufferSize >>> 8) & 0xff;
        out[8] = c.sedBufferSize & 0xff;
        out[9] = c.sedDatagramCount & 0xff;
        return out;
    }
}
