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
 * derive from this function — if they diverge, attributes silently stop persisting.
 */
export function memberKeyFor(
    primaryKey: ValReference.PrimaryKey,
    name: string | number,
    id: number | undefined,
): string | number {
    return primaryKey === "id" ? (id ?? name) : name;
}

/**
 * The key under the other keying convention, if distinct from {@link memberKeyFor}'s — whether a reader may fall
 * back to it is the reader's policy.
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
 * Read a member from container at key, falling back to fallbackKey; a caller passes `undefined` for fallbackKey
 * when it must not tolerate the fallback slot.
 */
export function memberValueOf(
    container: Val.Struct,
    key: string | number,
    fallbackKey: string | number | undefined,
): Val | undefined {
    if (key in container) {
        return container[key];
    }

    if (fallbackKey !== undefined && fallbackKey in container) {
        return container[fallbackKey];
    }

    return undefined;
}
