/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Create a deep copy of a data structure.
 *
 * Only copies enumerable properties.  Handles typed arrays and graphs.
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
            } else {
                clone = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
            }

            if (!clones) {
                clones = new Map();
            }
            clones.set(value, clone);

            return clone;
        }

        return value;
    }

    return copy(value) as T;
}
