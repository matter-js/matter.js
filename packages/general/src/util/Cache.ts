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

export class AsyncCache<T> extends GenericCache<T> {
    constructor(
        name: string,
        private readonly generator: (...params: any[]) => Promise<T>,
        expiration: Duration,
        expireCallback?: (key: string, value: T) => Promise<void>,
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
