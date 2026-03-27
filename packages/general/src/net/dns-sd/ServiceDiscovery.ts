/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DnsRecord } from "#codec/DnsCodec.js";
import { ObserverGroup } from "#util/Observable.js";
import type { DnssdName } from "./DnssdName.js";
import type { DnssdNames } from "./DnssdNames.js";

/**
 * Async iterable that yields discovered {@link DnssdName}s.
 *
 * Since `DnssdName` extends `BasicObservable` (making it `AsyncIterable<DnssdName.Changes>`), using
 * `AsyncIterableIterator<DnssdName>` directly causes TypeScript to infer the wrong yield type.  This dedicated
 * interface avoids that issue.
 */
export interface NameDiscovery {
    next(): Promise<IteratorResult<DnssdName>>;
    return(): Promise<IteratorResult<DnssdName>>;
    [Symbol.asyncIterator](): NameDiscovery;
}

/**
 * Discover DNS-SD service instances matching a suffix.
 *
 * Returns an async iterable that yields each newly discovered {@link DnssdName} whose qname ends with the given
 * suffix.  The caller controls lifetime via {@link AbortSignal}: abort to stop discovery.  Cleanup (filter
 * removal, observer detach) happens automatically — whether stopped by abort or by `break`/`return` in a
 * `for await` loop.
 *
 * Example:
 * ```typescript
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 5000);
 *
 * for await (const name of discoverNames(names, "_myservice._tcp.local", controller.signal)) {
 *     console.log("found", name.qname);
 * }
 * ```
 */
export function discoverNames(names: DnssdNames, suffix: string, signal: AbortSignal): NameDiscovery {
    const normalizedSuffix = `.${suffix.toLowerCase().replace(/\.local$/, "")}.local`;
    const exactType = suffix.toLowerCase().replace(/\.local$/, "") + ".local";

    const filter = (record: DnsRecord) => {
        const lower = record.name.toLowerCase();
        return lower === exactType || lower.endsWith(normalizedSuffix);
    };

    names.filters.add(filter);

    const observers = new ObserverGroup();
    const queue: DnssdName[] = [];
    let waiting: ((value: IteratorResult<DnssdName>) => void) | undefined;
    let done = false;

    const push = (name: DnssdName) => {
        if (done) return;
        const lower = name.qname.toLowerCase();
        if (lower.endsWith(normalizedSuffix)) {
            if (waiting) {
                const resolve = waiting;
                waiting = undefined;
                resolve({ value: name, done: false });
            } else {
                queue.push(name);
            }
        }
    };

    const cleanup = () => {
        if (done) return;
        done = true;
        observers.close();
        names.filters.delete(filter);
        signal.removeEventListener("abort", onAbort);
        if (waiting) {
            const resolve = waiting;
            waiting = undefined;
            resolve({ value: undefined as any, done: true });
        }
    };

    const onAbort = () => cleanup();
    signal.addEventListener("abort", onAbort, { once: true });
    observers.on(names.discovered, push);

    // Seed with already-discovered names
    for (const name of names.discoveredNames()) {
        push(name);
    }

    // Check if already aborted
    if (signal.aborted) {
        cleanup();
    }

    const iterator: NameDiscovery = {
        next(): Promise<IteratorResult<DnssdName>> {
            if (done) {
                return Promise.resolve({ value: undefined as any, done: true });
            }
            if (queue.length > 0) {
                return Promise.resolve({ value: queue.shift()!, done: false });
            }
            return new Promise(resolve => {
                waiting = resolve;
            });
        },

        return(): Promise<IteratorResult<DnssdName>> {
            cleanup();
            return Promise.resolve({ value: undefined as any, done: true });
        },

        [Symbol.asyncIterator]() {
            return iterator;
        },
    };

    return iterator;
}
