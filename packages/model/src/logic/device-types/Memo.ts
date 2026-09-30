/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Values computed at most once per key, with `undefined` itself a valid cached result.
 *
 * @internal
 */
export class Memo<K, V> {
    #table = new Map<K, { value: V }>();

    /**
     * The value for {@link key}, computed by {@link compute} on first use.
     */
    get(key: K, compute: () => V): V {
        let entry = this.#table.get(key);
        if (entry === undefined) {
            entry = { value: compute() };
            this.#table.set(key, entry);
        }
        return entry.value;
    }
}
