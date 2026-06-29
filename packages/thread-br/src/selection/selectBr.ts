/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BorderRouterEntry } from "../discovery/BorderRouterEntry.js";

/**
 * Decoded subset of the MeshCoP `_meshcop` TXT `sb` (state bitmap) field that
 * matters for BR selection. Layout per OpenThread's `border_agent_txt_data.hpp`:
 *   bit 7  BBR Active
 *   bit 8  BBR Is Primary (only meaningful when BBR Active)
 */
export interface DecodedStateBitmap {
    bbrActive: boolean;
    bbrPrimary: boolean;
}

/**
 * Decode the BBR-relevant bits from a 4-byte state bitmap hex string.
 *
 * Returns `{ bbrActive: false, bbrPrimary: false }` for missing or malformed
 * input — selection treats absence and "no BBR role" as equivalent.
 */
export function decodeStateBitmap(hex: string | undefined): DecodedStateBitmap {
    if (hex === undefined || !/^[0-9a-fA-F]{1,8}$/.test(hex)) {
        return { bbrActive: false, bbrPrimary: false };
    }
    const value = parseInt(hex, 16);
    if (!Number.isFinite(value)) {
        return { bbrActive: false, bbrPrimary: false };
    }
    return {
        bbrActive: ((value >> 7) & 0x1) === 1,
        bbrPrimary: ((value >> 8) & 0x1) === 1,
    };
}

function hasLinkLocal(addresses: ReadonlyArray<string>): boolean {
    for (const addr of addresses) {
        if (addr.toLowerCase().startsWith("fe80:")) return true;
    }
    return false;
}

function scoreOf(br: BorderRouterEntry): number {
    const { bbrActive, bbrPrimary } = decodeStateBitmap(br.stateBitmapHex);
    // State tier dominates link-local so an active BBR always outranks an
    // ordinary router: primary BBR (4) > active-but-not-primary BBR (2) > rest (0).
    const stateScore = bbrActive ? (bbrPrimary ? 4 : 2) : 0;
    const llScore = hasLinkLocal(br.addresses) ? 1 : 0;
    return stateScore + llScore;
}

/**
 * Pick the best BR per spec FR-12 priority:
 *   1. State bitmap "BBR Active + Primary" (bits 7 and 8) wins.
 *   2. Then BBR Active but not Primary.
 *   3. Among equals: BR with at least one IPv6 link-local (`fe80:`) address wins.
 *   4. Among equals: alphabetical `extAddressHex` ascending (deterministic tie-break).
 */
export function selectBr(brs: ReadonlyArray<BorderRouterEntry>): BorderRouterEntry | undefined {
    return rankBrs(brs)[0];
}

/**
 * Rank all candidate BRs best-first using the same priority as {@link selectBr}.
 * Callers fall back to later entries when the preferred BR is unreachable.
 */
export function rankBrs(brs: ReadonlyArray<BorderRouterEntry>): BorderRouterEntry[] {
    return [...brs].sort((a, b) => {
        const byScore = scoreOf(b) - scoreOf(a);
        if (byScore !== 0) return byScore;
        return a.extAddressHex < b.extAddressHex ? -1 : a.extAddressHex > b.extAddressHex ? 1 : 0;
    });
}
