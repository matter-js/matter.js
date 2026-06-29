/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decoded Route64 TLV (Network Diagnostic TLV type 5).
 *
 * Layout per OpenThread `src/core/thread/mle_tlvs.hpp` `RouteTlv` and
 * `mle_types.hpp` `RouterIdMask`:
 *
 *   [0]     uint8     ID Sequence
 *   [1..8]  bytes[8]  Router ID Mask, big-endian bit order: router 0 is the
 *                     MSB of byte 0 (mask = 0x80 >> (id % 8)).
 *   [9..]   uint8[N]  N route-data bytes, one per allocated router (in
 *                     ascending router-id order).
 *
 * Each route-data byte:
 *   bits 7..6 = link quality out (0..3)
 *   bits 5..4 = link quality in  (0..3)
 *   bits 3..0 = route cost       (0..15)
 *
 * Note: this is the short (1-byte-per-entry) form. OpenThread's
 * `MLE_LONG_ROUTES` build-time option uses 1.5 bytes per entry — we have
 * never observed it in real Thread 1.x deployments and it is not required
 * for our default set.
 */
export interface Route64Entry {
    routerId: number;
    linkQualityIn: number;
    linkQualityOut: number;
    routeCost: number;
}

export interface Route64 {
    idSequence: number;
    entries: Route64Entry[];
}

const MASK_BYTES = 8;
const HEADER_BYTES = 1 + MASK_BYTES;
const MAX_ROUTER_ID = 62; // OpenThread `kMaxRouterId`.

const LINK_QUALITY_OUT_MASK = 0xc0;
const LINK_QUALITY_OUT_SHIFT = 6;
const LINK_QUALITY_IN_MASK = 0x30;
const LINK_QUALITY_IN_SHIFT = 4;
const ROUTE_COST_MASK = 0x0f;

function isRouterIdSet(mask: Uint8Array, routerId: number): boolean {
    return (mask[routerId >> 3] & (0x80 >> (routerId & 0x7))) !== 0;
}

function setRouterIdBit(mask: Uint8Array, routerId: number): void {
    mask[routerId >> 3] |= 0x80 >> (routerId & 0x7);
}

export namespace Route64 {
    export function decode(value: Uint8Array): Route64 {
        if (value.length < HEADER_BYTES) {
            throw new Error(`Route64 TLV too short: ${value.length} bytes (need >=${HEADER_BYTES})`);
        }
        const idSequence = value[0];
        const mask = value.subarray(1, HEADER_BYTES);

        const allocatedIds = new Array<number>();
        for (let id = 0; id <= MAX_ROUTER_ID; id++) {
            if (isRouterIdSet(mask, id)) allocatedIds.push(id);
        }

        if (value.length !== HEADER_BYTES + allocatedIds.length) {
            throw new Error(
                `Route64 TLV size mismatch: ${value.length} bytes for ${allocatedIds.length} allocated routers`,
            );
        }

        const entries = new Array<Route64Entry>();
        for (let i = 0; i < allocatedIds.length; i++) {
            const data = value[HEADER_BYTES + i];
            entries.push({
                routerId: allocatedIds[i],
                linkQualityOut: (data & LINK_QUALITY_OUT_MASK) >> LINK_QUALITY_OUT_SHIFT,
                linkQualityIn: (data & LINK_QUALITY_IN_MASK) >> LINK_QUALITY_IN_SHIFT,
                routeCost: data & ROUTE_COST_MASK,
            });
        }
        return { idSequence, entries };
    }

    export function encode(route: Route64): Uint8Array {
        const sortedEntries = [...route.entries].sort((a, b) => a.routerId - b.routerId);

        const out = new Uint8Array(HEADER_BYTES + sortedEntries.length);
        out[0] = route.idSequence & 0xff;
        const mask = out.subarray(1, HEADER_BYTES);

        for (let i = 0; i < sortedEntries.length; i++) {
            const e = sortedEntries[i];
            if (!Number.isInteger(e.routerId) || e.routerId < 0 || e.routerId > MAX_ROUTER_ID) {
                throw new Error(`Route64 router ID out of range: ${e.routerId}`);
            }
            if (i > 0 && sortedEntries[i - 1].routerId === e.routerId) {
                throw new Error(`Route64 duplicate router ID: ${e.routerId}`);
            }
            setRouterIdBit(mask, e.routerId);

            const lqOut = e.linkQualityOut & 0x3;
            const lqIn = e.linkQualityIn & 0x3;
            const cost = e.routeCost & 0xf;
            out[HEADER_BYTES + i] = (lqOut << LINK_QUALITY_OUT_SHIFT) | (lqIn << LINK_QUALITY_IN_SHIFT) | cost;
        }
        return out;
    }
}
