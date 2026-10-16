/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AclCapacityExceededError,
    CapacityExceededError,
    GroupCapacityExceededError,
    GroupKeyCapacityExceededError,
} from "./errors.js";
import type { CapacityInfo } from "./ItemKind.js";
import { itemMapKey, ManagedItem } from "./types.js";

/**
 * Observed per-fabric device limits, keyed by item kind.
 *
 * A snapshot the reconciler refreshes — on connect, after firmware changes, and after each write of a kind that
 * reports capacity — not a live count. Admission reads it and may lag a change another administrator made; the
 * device's own refusal of the write stays the final gate.
 */
export type CapacityCache = Record<string, CapacityInfo>;

type CapacityErrorCtor = new (kind: string, limit: number, used: number, requested: number) => CapacityExceededError;

// Keyed by the item kind names `@matter/node-manager` registers, which this package cannot import.
const CAPACITY_ERROR_BY_KIND: Record<string, CapacityErrorCtor> = {
    acl: AclCapacityExceededError,
    groupKeyMap: GroupCapacityExceededError,
    endpointGroupMembership: GroupCapacityExceededError,
    groupKey: GroupKeyCapacityExceededError,
};

export function assertCapacity(kind: string, cache: CapacityCache, requested = 1): void {
    const info = cache[kind];
    if (info === undefined) {
        return;
    }
    if (info.used + requested > info.limit) {
        const Ctor = CAPACITY_ERROR_BY_KIND[kind] ?? CapacityExceededError;
        throw new Ctor(kind, info.limit, info.used, requested);
    }
}

/**
 * Refuse adding the items `keys` names for `kind` when the capacity snapshot says the device has no room for them.
 *
 * Only keys desired state does not hold yet take a slot; a key it already holds is an entry the device has or is
 * about to have. With no snapshot for the kind — nothing has been refreshed yet — nothing is refused, and the
 * device's refusal of the write is the gate.
 */
export function assertCanAddItems(
    state: { items: Record<string, ManagedItem>; capacities: CapacityCache },
    kind: string,
    keys: readonly string[],
): void {
    const requested = new Set(keys.filter(key => state.items[itemMapKey(kind, key)] === undefined)).size;
    if (requested > 0) {
        assertCapacity(kind, state.capacities, requested);
    }
}
