/**
 * Cache computed values or resources for a specified duration to improve performances.
 *
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, MatterAggregateError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { Logger } from "../log/Logger.js";
import { Time, Timer } from "../time/Time.js";
import { Lifetime } from "./Lifetime.js";

/** ASCII Unit Separator — unlikely to appear in the interface names, IPs, or booleans current callers pass. */
const KEY_SEPARATOR = "\x1F";

const logger = Logger.get("Cache");

class GenericCache<T> {
    protected readonly knownKeys = new Set<string>();
    protected readonly values = new Map<string, T>();
    protected readonly timestamps = new Map<string, number>();
    private readonly periodicTimer: Timer;
    readonly #lifetime: Lifetime;

    constructor(
        name: string,
        lifetime: Lifetime.Owner,
        private readonly expiration: Duration,
        private readonly expireCallback?: (key: string, value: T) => Promise<void>,
    ) {
        this.#lifetime = lifetime.join(`${name} cache`);
        const lifetimeName = String(this.#lifetime.name);
        this.periodicTimer = Time.getPeriodicTimer(
            Diagnostic.upgrade(`${lifetimeName} expiration`, [Diagnostic.strong(lifetimeName), "expiration"]),
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

    /**
     * Expire the value cached under `key`.  The value leaves the cache even when {@link expireCallback} rejects, because
     * nothing would retry it.
     */
    async delete(key: string) {
        try {
            // Cached-undefined must still trigger expireCallback.
            if (this.expireCallback !== undefined && this.values.has(key)) {
                await this.expireCallback(key, this.values.get(key) as T);
            }
        } finally {
            this.values.delete(key);
            this.timestamps.delete(key);
        }
    }

    /** Evict the entry addressed by the same params passed to {@link Cache.get}/{@link AsyncCache.get}. */
    async evict(...params: unknown[]) {
        await this.delete(this.keyFor(params));
    }

    /**
     * Expire all values.
     *
     * @throws {MatterAggregateError} with the rejection of each {@link expireCallback} that failed, after every value
     * was expired
     */
    async clear() {
        const failures = await this.expireAll();
        if (failures.length) {
            throw new MatterAggregateError(
                failures.map(({ error }) => error),
                `${this.#describe()} failed to expire ${failures.map(({ key }) => key).join(", ")}`,
            );
        }
    }

    /**
     * Expire all values and refuse further {@link Cache.get}/{@link AsyncCache.get} calls.  Creations already pending
     * finish and are expired like any other value.  A failed {@link expireCallback} is logged and does not stop
     * closing.
     */
    async close() {
        using _closing = this.#lifetime.closing();
        this.periodicTimer.stop();
        this.#logFailures(await this.expireAll());
        this.knownKeys.clear();
    }

    /** Expire every value, including values created while this runs, and return the failures. */
    protected async expireAll() {
        return this.#expireWhere(() => true);
    }

    /**
     * Iterates the live map, so a value created or refreshed while an earlier callback is awaited is judged by its
     * current timestamp.
     */
    async #expireWhere(expires: (timestamp: number) => boolean) {
        const failures = new Array<{ key: string; error: unknown }>();
        for (const [key, timestamp] of this.timestamps) {
            if (!expires(timestamp)) {
                continue;
            }
            try {
                await this.delete(key);
            } catch (error) {
                failures.push({ key, error });
            }
        }
        return failures;
    }

    #logFailures(failures: { key: string; error: unknown }[]) {
        for (const { key, error } of failures) {
            logger.warn(`${this.#describe()} failed to expire ${key}:`, error);
        }
    }

    #describe() {
        return String(this.#lifetime.name);
    }

    /**
     * Set once this cache or any lifetime enclosing it begins closing, so an owner that closes before calling
     * {@link close} already stops new values.
     */
    protected get isClosed() {
        for (let lifetime: Lifetime | undefined = this.#lifetime; lifetime !== undefined; lifetime = lifetime.owner) {
            if (lifetime.isClosing) {
                return true;
            }
        }
        return false;
    }

    protected closedError() {
        return new ClosedError(`${this.#describe()} is closed`);
    }

    private async expire() {
        const now = Time.nowMs;
        this.#logFailures(await this.#expireWhere(timestamp => now - timestamp >= this.expiration));
    }
}

export class Cache<T> extends GenericCache<T> {
    constructor(
        name: string,
        lifetime: Lifetime.Owner,
        private readonly generator: (...params: any[]) => T,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => Promise<void>,
    ) {
        super(name, lifetime, expiration, expireCallback);
    }

    /**
     * @throws {ClosedError} if the cache is closed
     */
    get(...params: any[]) {
        if (this.isClosed) {
            throw this.closedError();
        }
        const key = this.keyFor(params);
        if (!this.values.has(key)) {
            this.values.set(key, this.generator(...params));
            this.knownKeys.add(key);
        }
        this.timestamps.set(key, Time.nowMs);
        return this.values.get(key) as T;
    }
}

export class AsyncCache<T> extends GenericCache<T> {
    readonly #inflight = new Map<string, Promise<T>>();

    constructor(
        name: string,
        lifetime: Lifetime.Owner,
        private readonly generator: (...params: any[]) => Promise<T>,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => Promise<void>,
    ) {
        super(name, lifetime, expiration, expireCallback);
    }

    /**
     * Rejects with {@link ClosedError} if the cache is closed.
     */
    get(...params: any[]): Promise<T> {
        if (this.isClosed) {
            return Promise.reject(this.closedError());
        }
        const key = this.keyFor(params);
        if (this.values.has(key)) {
            this.timestamps.set(key, Time.nowMs);
            return Promise.resolve(this.values.get(key) as T);
        }
        let pending = this.#inflight.get(key);
        if (pending === undefined) {
            pending = this.#fill(key, params);
            this.#inflight.set(key, pending);
            // Cleanup runs off the side — chaining it onto the caller's path would delay resolution by a microtask.
            const drop = () => this.#inflight.delete(key);
            pending.then(drop, drop);
        }
        return pending;
    }

    async #fill(key: string, params: any[]): Promise<T> {
        const value = await this.generator(...params);
        this.values.set(key, value);
        this.knownKeys.add(key);
        this.timestamps.set(key, Time.nowMs);
        return value;
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

    protected override async expireAll() {
        await Promise.allSettled(this.#inflight.values());
        return super.expireAll();
    }
}
