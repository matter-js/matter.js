/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDeepEqual, isObject } from "@matter/general";
import type { Val } from "@matter/protocol";
import { FabricIndex } from "@matter/types";

/**
 * Whether a client node writes an entry of a fabric-scoped list as its own.  An entry is ours if its FabricIndex is our
 * fabric index on the peer, `FabricIndex.OMIT_FABRIC` or absent, as for a new entry.  An entry of
 * `FabricIndex.NO_FABRIC` is scoped to no fabric, and a value that is not a struct has no fabric, so neither is ours.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.1
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.9.1
 */
export function isOwnEntry(entry: Val, fabricIndexOnPeer: FabricIndex) {
    if (!isObject(entry)) {
        return false;
    }
    const { fabricIndex } = entry;
    return fabricIndex === undefined || fabricIndex === FabricIndex.OMIT_FABRIC || fabricIndex === fabricIndexOnPeer;
}

/**
 * The entries of a fabric-scoped list a client node writes, sorted by what happens to them.
 */
export interface FabricScopedWrite {
    /**
     * Our entries, in their order, each with our fabric index on the peer as its FabricIndex, so the cache holds the
     * index the device stores.  The encoder leaves FabricIndex out of a write.
     */
    own: Val.List;

    /**
     * The number of entries left out because they are not ours and equal an entry of the cached list.  The device
     * ignores them, so writing back a list read without fabric filtering keeps them.
     */
    unchanged: number;

    /**
     * The first entry that is not ours and not in the cached list, if any: an entry that is not a struct, or one whose
     * FabricIndex the caller chose or whose content the caller edited.  The device would store it under our fabric or
     * ignore it, so the write must be refused.
     */
    misused?: Val;
}

/**
 * Sort the entries of {@link list} for a write; see {@link FabricScopedWrite}.  The entries of {@link list} stay
 * unchanged.
 *
 * @param cached the cached value of the list when the write is sent
 *
 * @see {@link MatterSpecification.v161.Core} § 7.13.6
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.2
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.9.1
 */
export function fabricScopedWriteOf(list: Val.List, cached: Val, fabricIndexOnPeer: FabricIndex): FabricScopedWrite {
    const cachedEntries = Array.isArray(cached) ? cached : [];
    const own = new Array<Val>();
    let unchanged = 0;
    for (const entry of list) {
        if (isOwnEntry(entry, fabricIndexOnPeer)) {
            own.push(
                isObject(entry) && entry.fabricIndex !== fabricIndexOnPeer
                    ? { ...entry, fabricIndex: fabricIndexOnPeer }
                    : entry,
            );
        } else if (cachedEntries.some(cachedEntry => isDeepEqual(entry, cachedEntry, true))) {
            unchanged++;
        } else {
            return { own, unchanged, misused: entry };
        }
    }
    return { own, unchanged };
}

/**
 * The cached value of a fabric-scoped list after the device accepted a write of our entries {@link written}.
 *
 * A write replaces only the entries of the accessing fabric, so every other entry of {@link cached} stays in its
 * place.  {@link written} takes the places of our cached entries in order; entries beyond those places go to the end,
 * and our cached entries that no written entry takes are removed.
 * The device may order the list differently; its next report replaces the cached list.
 *
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.2
 */
export function withEntriesOfOtherFabrics(cached: Val, written: Val.List, fabricIndexOnPeer: FabricIndex): Val.List {
    if (!Array.isArray(cached)) {
        return written;
    }

    const merged = new Array<Val>();
    let next = 0;
    for (const entry of cached) {
        if (!isOwnEntry(entry, fabricIndexOnPeer)) {
            merged.push(entry);
        } else if (next < written.length) {
            merged.push(written[next++]);
        }
    }
    merged.push(...written.slice(next));
    return merged;
}
