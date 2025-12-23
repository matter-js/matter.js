/**
 * Cache computed values or resources for a specified duration to improve performances.
 *
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { MaybePromise } from "#util/Promises.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { Time, Timer } from "../time/Time.js";

type ReturnLikeExpire<E extends MaybePromise> = E extends Promise<void> ? Promise<void> : void;

class GenericCache<T, E extends MaybePromise> {
    protected readonly knownKeys = new Set<string>();
    protected readonly values = new Map<string, T>();
    protected readonly timestamps = new Map<string, number>();
    private readonly periodicTimer: Timer;

    constructor(
        name: string,
        private readonly expiration: Duration,
        private readonly expireCallback?: (key: string, value: T) => E,
    ) {
        this.periodicTimer = Time.getPeriodicTimer(
            Diagnostic.upgrade(`${name} cache expiration`, [Diagnostic.strong(name), "cache expiration"]),
            expiration,
            () => this.expire(),
        ).start();
        this.periodicTimer.utility = true;
    }

    keys() {
        return Array.from(this.knownKeys.values());
    }

    delete(key: string): ReturnLikeExpire<E> {
        const value = this.values.get(key);
        const callback =
            this.expireCallback !== undefined && value !== undefined ? this.expireCallback(key, value) : undefined;
        return MaybePromise.then(callback, () => {
            this.values.delete(key);
            this.timestamps.delete(key);
        }) as ReturnLikeExpire<E>;
    }

    clear(): ReturnLikeExpire<E> {
        const deletes = new Array<PromiseLike<void>>();
        for (const key of this.values.keys()) {
            const result = this.delete(key);
            if (MaybePromise.is(result)) {
                deletes.push(result);
            }
        }
        return MaybePromise.then(deletes.length ? Promise.allSettled(deletes) : undefined, () => {
            this.values.clear();
            this.timestamps.clear();
        }) as ReturnLikeExpire<E>;
    }

    close(): ReturnLikeExpire<E> {
        return MaybePromise.then(this.clear(), () => {
            this.knownKeys.clear();
            this.periodicTimer.stop();
        }) as ReturnLikeExpire<E>;
    }

    private expire(): ReturnLikeExpire<E> {
        const now = Time.nowMs;
        const deletes = new Array<PromiseLike<void>>();
        for (const [key, timestamp] of this.timestamps.entries()) {
            if (now - timestamp < this.expiration) continue;
            const result = this.delete(key);
            if (MaybePromise.is(result)) {
                deletes.push(result);
            }
        }
        if (deletes.length) {
            return Promise.allSettled(deletes).then(() => {}) as ReturnLikeExpire<E>;
        }
        return undefined as ReturnLikeExpire<E>;
    }
}

export class Cache<T, E extends MaybePromise> extends GenericCache<T, E> {
    constructor(
        name: string,
        private readonly generator: (...params: any[]) => T,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => E,
    ) {
        super(name, expiration, expireCallback);
    }

    get(...params: any[]) {
        const key = params.join(",");
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

export class AsyncCache<T, E extends MaybePromise> extends GenericCache<T, E> {
    constructor(
        name: string,
        private readonly generator: (...params: any[]) => Promise<T>,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => E,
    ) {
        super(name, expiration, expireCallback);
    }

    async get(...params: any[]) {
        const key = params.join(",");
        let value = this.values.get(key);
        if (value === undefined) {
            value = await this.generator(...params);
            this.values.set(key, value);
            this.knownKeys.add(key);
        }
        this.timestamps.set(key, Time.nowMs);
        return value;
    }
}
