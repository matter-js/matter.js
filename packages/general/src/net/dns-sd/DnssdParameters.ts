/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";

/**
 * Parsed key/value pairs from a DNS-SD service's TXT records.
 *
 * Implements {@link ReadonlyMap}<string, string> with UTF-8 decoded values. Use {@link raw} for the original byte
 * sequence — required for binary TXT fields such as the Thread MeshCoP `xa`, `xp`, `at`, `pt`, `sb`, and `dd` keys
 * (RFC 6763 §6 — TXT values are opaque binary data; non-UTF-8 bytes mojibake to U+FFFD via the string accessors).
 *
 * Keys are case-insensitive: lookups ignore case, and of several entries whose keys differ only in case the first one
 * wins.  Iteration yields each key as the first entry spelled it.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc6763#section-6.4 | RFC 6763 §6.4}
 */
export class DnssdParameters implements ReadonlyMap<string, string> {
    readonly #entries = new Map<string, { key: string; value: Bytes }>();

    /**
     * @param entries key/value pairs in wire order
     */
    constructor(entries: Iterable<readonly [key: string, value: Bytes]>) {
        for (const [key, value] of entries) {
            const folded = key.toLowerCase();
            if (!this.#entries.has(folded)) {
                this.#entries.set(folded, { key, value });
            }
        }
    }

    get(key: string): string | undefined {
        const v = this.raw(key);
        return v === undefined ? undefined : Bytes.toString(v);
    }

    /**
     * The original bytes for the given key, or `undefined` if absent.
     */
    raw(key: string): Bytes | undefined {
        return this.#entries.get(key.toLowerCase())?.value;
    }

    has(key: string): boolean {
        return this.#entries.has(key.toLowerCase());
    }

    get size(): number {
        return this.#entries.size;
    }

    *keys(): MapIterator<string> {
        for (const { key } of this.#entries.values()) {
            yield key;
        }
    }

    *values(): MapIterator<string> {
        for (const { value } of this.#entries.values()) {
            yield Bytes.toString(value);
        }
    }

    *entries(): MapIterator<[string, string]> {
        for (const { key, value } of this.#entries.values()) {
            yield [key, Bytes.toString(value)];
        }
    }

    [Symbol.iterator](): MapIterator<[string, string]> {
        return this.entries();
    }

    forEach(cb: (value: string, key: string, map: ReadonlyMap<string, string>) => void, thisArg?: unknown): void {
        for (const [k, v] of this.entries()) {
            cb.call(thisArg, v, k, this);
        }
    }
}
