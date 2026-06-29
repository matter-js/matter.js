/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One decoded Router Neighbor entry from Network Diagnostic TLV type 31.
 *
 * Per-entry layout from OpenThread `src/core/thread/net_diag_tlvs.hpp`
 * `RouterNeighborTlvValue` (packed struct, ENTRY_BYTES = 24 bytes total):
 *
 *   [0]      uint8     mFlags         — bit 7 = kFlagsTrackErrRate
 *   [1..2]   uint16 BE mRloc16
 *   [3..10]  uint8[8]  mExtAddress
 *   [11..12] uint16 BE mVersion
 *   [13..16] uint32 BE mConnectionTime (seconds since link establishment)
 *   [17]     uint8     mLinkMargin    (dB)
 *   [18]     int8      mAverageRssi   (dBm; 127 = not available / unknown)
 *   [19]     int8      mLastRssi      (dBm; 127 = not available / unknown)
 *   [20..21] uint16 BE mFrameErrorRate   (0x0000=0%, 0xffff=100%; valid only when supportsErrorRate=true)
 *   [22..23] uint16 BE mMessageErrorRate (0x0000=0%, 0xffff=100%; valid only when supportsErrorRate=true)
 */
export interface RouterNeighborEntry {
    rloc16: number;
    /** 8-byte IEEE EUI-64 extended address. */
    extAddress: Uint8Array;
    version: number;
    /** Seconds elapsed since link establishment. */
    connectionTime: number;
    /** Link margin in dB. */
    linkMargin: number;
    /** Whether this node tracks frame/message error rates (mFlags bit 7). */
    supportsErrorRate: boolean;
    /** Average RSSI in dBm. 127 when not available or unknown. */
    averageRssi: number;
    /** RSSI of the last received frame in dBm. 127 when not available or unknown. */
    lastRssi: number;
    /** Frame error rate as a raw uint16 (0x0000=0%, 0xffff=100%). Valid when supportsErrorRate=true. */
    frameErrorRate: number;
    /** IPv6-message error rate as a raw uint16 (0x0000=0%, 0xffff=100%). Valid when supportsErrorRate=true. */
    messageErrorRate: number;
}

// Per OpenThread `net_diag_tlvs.hpp` `RouterNeighborTlvValue` (24-byte packed struct).
const ENTRY_BYTES = 24;
const FLAGS_TRACK_ERR_RATE = 0x80; // kFlagsTrackErrRate = 1 << 7

export namespace RouterNeighbor {
    export function decode(value: Uint8Array): RouterNeighborEntry[] {
        const entryCount = Math.floor(value.length / ENTRY_BYTES);
        const entries = new Array<RouterNeighborEntry>();

        for (let i = 0; i < entryCount; i++) {
            const off = i * ENTRY_BYTES;
            const flags = value[off];
            const rloc16 = (value[off + 1] << 8) | value[off + 2];
            const extAddress = value.slice(off + 3, off + 11);
            const version = (value[off + 11] << 8) | value[off + 12];
            const connectionTime =
                ((value[off + 13] << 24) | (value[off + 14] << 16) | (value[off + 15] << 8) | value[off + 16]) >>> 0;
            const linkMargin = value[off + 17];
            // int8 signed decode: values >= 128 are negative (two's complement).
            const averageRssi = value[off + 18] > 127 ? value[off + 18] - 256 : value[off + 18];
            const lastRssi = value[off + 19] > 127 ? value[off + 19] - 256 : value[off + 19];
            const frameErrorRate = (value[off + 20] << 8) | value[off + 21];
            const messageErrorRate = (value[off + 22] << 8) | value[off + 23];

            entries.push({
                rloc16,
                extAddress,
                version,
                connectionTime,
                linkMargin,
                supportsErrorRate: (flags & FLAGS_TRACK_ERR_RATE) !== 0,
                averageRssi,
                lastRssi,
                frameErrorRate,
                messageErrorRate,
            });
        }

        return entries;
    }
}
