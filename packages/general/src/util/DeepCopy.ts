/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create a deep copy of a data structure.
 *
 * Only copies enumerable properties.  Handles typed arrays, Sets, Maps and graphs.
 */
export function deepCopy<T>(value: T): T {
    let clones: undefined | Map<unknown, unknown>;

    function copy(value: unknown) {
        if (typeof value === "object") {
            if (value === null) {
                return null;
            }

            let clone = clones?.get(value);
            if (clone) {
                return clone;
            }

            if (Array.isArray(value)) {
                clone = value.map(copy);
            } else if (ArrayBuffer.isView(value)) {
                const ViewType = value.constructor as unknown as { from(v: typeof value): typeof value };
                clone = ViewType.from(value);
            } else if (value instanceof Set) {
                // Register the empty clone before recursing so a cyclic member resolves to the clone, not an infinite loop.
                const set = remember(value, new Set());
                for (const member of value) {
                    set.add(copy(member));
                }
                return set;
            } else if (value instanceof Map) {
                const map = remember(value, new Map());
                for (const [k, v] of value) {
                    map.set(copy(k), copy(v));
                }
                return map;
            } else {
                clone = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
            }

            return remember(value, clone);
        }

        return value;
    }

    function remember<C>(original: unknown, clone: C): C {
        (clones ??= new Map()).set(original, clone);
        return clone;
    }

    return copy(value) as T;
}
