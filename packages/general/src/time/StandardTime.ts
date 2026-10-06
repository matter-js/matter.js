/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Boot } from "#util/Boot.js";
import { decamelize } from "#util/identifier-case.js";
import { Lifetime } from "#util/Lifetime.js";
import { INT32_MAX } from "#util/Number.js";
import { Duration } from "./Duration.js";
import { Time, Timer } from "./Time.js";
import { Instant } from "./TimeUnit.js";

/**
 * A {@link Timer} implementation that uses standard JavaScript timers.
 */
export class StandardTime extends Time {
    override getTimer(name: string, duration: Duration, callback: Timer.Callback) {
        return new StandardTimer(name, duration, callback, false);
    }

    override getPeriodicTimer(name: string, duration: Duration, callback: Timer.Callback) {
        return new StandardTimer(name, duration, callback, true);
    }
}

// Install optimal macrotask functionality based on available vm features
{
    let macrotask;
    const { setImmediate } = globalThis as { setImmediate?: (fn: () => void) => void };
    if (setImmediate !== undefined) {
        // node.js(ish)
        macrotask = () => new Promise<void>(resolve => setImmediate(resolve));
    } else if (typeof MessageChannel !== "undefined") {
        // Modern browsers
        macrotask = () =>
            new Promise<void>(resolve => {
                const channel = new MessageChannel();
                channel.port1.onmessage = () => resolve();
                channel.port2.postMessage(null);
            });
    } else {
        // Standard setTimeout but incurs a 1-4ms (node) or 4ms (browser) penalty
        macrotask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    Object.defineProperty(StandardTime.prototype, "macrotask", { get: macrotask });
}

/**
 * Longest delay `setTimeout` and `setInterval` accept; a longer interval runs as a chain of steps no longer than this.
 */
const MAX_STEP_MS = INT32_MAX;

/**
 * A {@link Timer} implementation that uses standard JavaScript functions.
 */
export class StandardTimer implements Timer {
    #timerId: unknown;
    #usesInterval = false;
    #armedInterval = Instant;
    #deadline = 0;
    #utility = false;
    #interval = Instant; // Real value installed in constructor
    isRunning = false;

    get systemId() {
        return Number(this.#timerId);
    }

    constructor(
        readonly name: string,
        duration: Duration,
        private readonly callback: Timer.Callback,
        readonly isPeriodic: boolean,
    ) {
        this.interval = duration;
    }

    /**
     * The timer's interval.
     *
     * You can change this value but changes have no effect until the timer restarts.
     */
    set interval(interval: Duration) {
        if (!Number.isFinite(interval) || interval < 0) {
            throw new ImplementationError(
                `Invalid interval for timer "${this.name}": ${interval}; it must be finite and not negative`,
            );
        }
        this.#interval = interval;
    }

    get interval() {
        return this.#interval;
    }

    get utility() {
        return this.#utility;
    }

    set utility(utility: boolean) {
        if (utility === this.#utility) {
            return;
        }

        // Support node.js-style environments to control whether the timer blocks process exit
        if (this.#timerId !== undefined) {
            const timerId = this.#timerId as { ref?: () => void; unref?: () => void };
            if (utility) {
                timerId.unref?.();
            } else {
                timerId.ref?.();
            }
        }

        this.#utility = utility;
    }

    start() {
        if (this.isRunning) this.stop();
        Time.register(this);
        this.isRunning = true;
        this.#armedInterval = this.interval;
        if (this.isPeriodic && this.#armedInterval <= MAX_STEP_MS) {
            this.#usesInterval = true;
            this.#timerId = setInterval(() => this.#fire(), this.#armedInterval);
            this.#applyUtility();
        } else {
            this.#usesInterval = false;
            this.#deadline = Time.nowUs + this.#armedInterval;
            this.#arm(this.#armedInterval);
        }
        return this;
    }

    /**
     * Intermediate steps re-measure the remaining time against the monotonic deadline, so a late step does not delay the
     * fire.
     */
    #arm(remaining: number) {
        const final = remaining <= MAX_STEP_MS;
        this.#timerId = setTimeout(
            () => (final ? this.#fire() : this.#arm(this.#deadline - Time.nowUs)),
            final ? Math.max(remaining, 0) : MAX_STEP_MS,
        );
        this.#applyUtility();
    }

    #fire() {
        using lifetime = Lifetime(decamelize(this.name, " "));
        if (!this.isPeriodic) {
            Time.unregister(this);
            this.isRunning = false;
        } else if (!this.#usesInterval) {
            this.#deadline += this.#armedInterval;
            this.#arm(this.#deadline - Time.nowUs);
        }
        this.callback(lifetime);
    }

    #applyUtility() {
        if (this.#utility) {
            (this.#timerId as { unref?: () => void }).unref?.();
        }
    }

    stop() {
        (this.#usesInterval ? clearInterval : clearTimeout)(this.#timerId as ReturnType<typeof setTimeout>);
        Time.unregister(this);
        this.isRunning = false;
        return this;
    }
}

Boot.init(() => {
    Time.default = new StandardTime();

    Time.startup.systemMs = Time.startup.processMs = Time.nowMs;

    // Hook for testing frameworks
    if (typeof MatterHooks !== "undefined") {
        MatterHooks?.timeSetup?.(Time);
    }
});
