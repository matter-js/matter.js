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
 */
export class DnssdParameters implements ReadonlyMap<string, string> {
    readonly #raw: ReadonlyMap<string, Bytes>;

    constructor(raw: ReadonlyMap<string, Bytes>) {
        this.#raw = raw;
    }

    get(key: string): string | undefined {
        const v = this.#raw.get(key);
        return v === undefined ? undefined : Bytes.toString(v);
    }

    /**
     * The original bytes for {@link key}, or `undefined` if absent.
     */
    raw(key: string): Bytes | undefined {
        return this.#raw.get(key);
    }

    has(key: string): boolean {
        return this.#raw.has(key);
    }

    get size(): number {
        return this.#raw.size;
    }

    keys(): MapIterator<string> {
        return this.#raw.keys();
    }

    *values(): MapIterator<string> {
        for (const v of this.#raw.values()) {
            yield Bytes.toString(v);
        }
    }

    *entries(): MapIterator<[string, string]> {
        for (const [k, v] of this.#raw) {
            yield [k, Bytes.toString(v)];
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
