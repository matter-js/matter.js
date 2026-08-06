/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "@matter/protocol";
import type { ValReference } from "./ValReference.js";

/**
 * The slot a member occupies in a container keyed by {@link ValReference.primaryKey}.
 *
 * The persisted key set ({@link RootSupervisor.persistentKeys}) and a datasource container's own keys must both
 * derive from this function — if they diverge, attributes silently stop persisting.  Callers must also agree on the
 * id source: persistentKeys passes effectiveId where container writers pass id, equal for cluster attributes.
 */
export function memberKeyFor(
    primaryKey: ValReference.PrimaryKey,
    name: string | number,
    id: number | undefined,
): string | number {
    return primaryKey === "id" ? (id ?? name) : name;
}

/**
 * The key under the other keying convention, if distinct from {@link memberKeyFor}'s.  For write migration — a
 * reader uses {@link memberReadFallbackKeyFor}.
 */
export function memberFallbackKeyFor(
    primaryKey: ValReference.PrimaryKey,
    name: string | number,
    id: number | undefined,
): string | number | undefined {
    const key = memberKeyFor(primaryKey, name, id);
    return primaryKey === "id" ? (key === name ? undefined : name) : id;
}

/**
 * The fallback slot a read may accept: a value decoded without a schema keys its members by TLV tag number, so a
 * name-keyed container's reader accepts the element ID too. For an id-keyed container this is `undefined` — its
 * name slot never holds peer data (see {@link ValReference.PrimaryKey}), only residue such as a legacy store's
 * seeded default or an explicit `undefined` from attribute pruning.
 */
export function memberReadFallbackKeyFor(
    primaryKey: ValReference.PrimaryKey,
    name: string | number,
    id: number | undefined,
): string | number | undefined {
    return primaryKey === "name" ? memberFallbackKeyFor(primaryKey, name, id) : undefined;
}

/**
 * The slot a member currently occupies in container — key, fallbackKey if present there instead, else undefined.
 */
export function memberSlotOf(
    container: Val.Struct,
    key: string | number,
    fallbackKey: string | number | undefined,
): string | number | undefined {
    if (key in container) {
        return key;
    }

    if (fallbackKey !== undefined && fallbackKey in container) {
        return fallbackKey;
    }

    return undefined;
}

/**
 * Read a member from container at key, falling back to fallbackKey; a caller passes `undefined` for fallbackKey
 * when it must not tolerate the fallback slot.
 */
export function memberValueOf(
    container: Val.Struct,
    key: string | number,
    fallbackKey: string | number | undefined,
): Val | undefined {
    const slot = memberSlotOf(container, key, fallbackKey);
    return slot === undefined ? undefined : container[slot];
}
