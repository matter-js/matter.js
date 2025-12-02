/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#MatterError.js";
import { Boot } from "#util/Boot.js";
import { decamelize } from "#util/identifier-case.js";
import { Lifetime } from "#util/Lifetime.js";
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

/**
 * A {@link Timer} implementation that uses standard JavaScript functions.
 */
export class StandardTimer implements Timer {
    #timerId: unknown;
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
        if (interval < 0 || interval > 2147483647) {
            throw new ImplementationError(
                `Invalid intervalMs: ${interval}. The value must be between 0 and 32-bit maximum value (2147483647)`,
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
        this.#timerId = (this.isPeriodic ? setInterval : setTimeout)(() => {
            using lifetime = Lifetime(decamelize(this.name, " "));
            if (!this.isPeriodic) {
                Time.unregister(this);
                this.isRunning = false;
            }
            this.callback(lifetime);
        }, this.interval);
        return this;
    }

    stop() {
        (this.isPeriodic ? clearInterval : clearTimeout)(this.#timerId as ReturnType<typeof setTimeout>);
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
