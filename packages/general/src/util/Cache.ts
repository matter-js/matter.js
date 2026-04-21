/**
 * Cache computed values or resources for a specified duration to improve performances.
 *
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { Time, Timer } from "../time/Time.js";

/** ASCII Unit Separator — cannot appear in stringified interface names, IPs, or primitives. */
const KEY_SEPARATOR = "\x1F";

class GenericCache<T> {
    protected readonly knownKeys = new Set<string>();
    protected readonly values = new Map<string, T>();
    protected readonly timestamps = new Map<string, number>();
    private readonly periodicTimer: Timer;

    constructor(
        name: string,
        private readonly expiration: Duration,
        private readonly expireCallback?: (key: string, value: T) => Promise<void>,
    ) {
        this.periodicTimer = Time.getPeriodicTimer(
            Diagnostic.upgrade(`${name} cache expiration`, [Diagnostic.strong(name), "cache expiration"]),
            expiration,
            () => this.expire(),
        ).start();
        this.periodicTimer.utility = true;
    }

    // Single-param keys must stay identical to the stringified raw value so `keys()` → `get()` round-trips.
    protected keyFor(params: unknown[]): string {
        return params.map(p => String(p)).join(KEY_SEPARATOR);
    }

    keys() {
        return Array.from(this.knownKeys.values());
    }

    async delete(key: string) {
        const value = this.values.get(key);
        if (this.expireCallback !== undefined && value !== undefined) {
            await this.expireCallback(key, value);
        }
        this.values.delete(key);
        this.timestamps.delete(key);
    }

    async clear() {
        for (const key of this.values.keys()) {
            await this.delete(key);
        }
        this.values.clear();
        this.timestamps.clear();
    }

    async close() {
        await this.clear();
        this.knownKeys.clear();
        this.periodicTimer.stop();
    }

    private async expire() {
        const now = Time.nowMs;
        for (const [key, timestamp] of this.timestamps.entries()) {
            if (now - timestamp < this.expiration) continue;
            await this.delete(key);
        }
    }
}

export class Cache<T> extends GenericCache<T> {
    constructor(
        name: string,
        private readonly generator: (...params: any[]) => T,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => Promise<void>,
    ) {
        super(name, expiration, expireCallback);
    }

    get(...params: any[]) {
        const key = this.keyFor(params);
        let value = this.values.get(key);
        if (value === undefined) {
            value = this.generator(...params);
            this.values.set(key, value);
            this.knownKeys.add(key);
        }
        this.timestamps.set(key, Time.nowMs);
        return value;
    }
}

export class AsyncCache<T> extends GenericCache<T> {
    readonly #inflight = new Map<string, Promise<T>>();

    constructor(
        name: string,
        private readonly generator: (...params: any[]) => Promise<T>,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => Promise<void>,
    ) {
        super(name, expiration, expireCallback);
    }

    async get(...params: any[]) {
        const key = this.keyFor(params);
        const cached = this.values.get(key);
        if (cached !== undefined) {
            this.timestamps.set(key, Time.nowMs);
            return cached;
        }
        let pending = this.#inflight.get(key);
        if (pending === undefined) {
            pending = this.#fill(key, params);
            this.#inflight.set(key, pending);
        }
        return pending;
    }

    async #fill(key: string, params: any[]): Promise<T> {
        try {
            const value = await this.generator(...params);
            this.values.set(key, value);
            this.knownKeys.add(key);
            this.timestamps.set(key, Time.nowMs);
            return value;
        } finally {
            this.#inflight.delete(key);
        }
    }

    // Sync point for `expireCallback` to see the settled value.
    override async delete(key: string) {
        const pending = this.#inflight.get(key);
        if (pending !== undefined) {
            try {
                await pending;
            } catch {
                // get() callers see the rejection on their own promise; don't surface it through delete().
            }
        }
        await super.delete(key);
    }

    override async clear() {
        await Promise.allSettled(this.#inflight.values());
        await super.clear();
    }
}
