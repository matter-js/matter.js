/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot } from "#util/Boot.js";
import { CancelablePromise } from "#util/Cancelable.js";
import { ImplementationError } from "../MatterError.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { DiagnosticSource } from "../log/DiagnosticSource.js";
import { Duration } from "./Duration.js";
import { Instant } from "./TimeUnit.js";
import type { Timestamp } from "./Timestamp.js";

const registry = new Set<Timer>();

/**
 * Timer and date/time management interface.
 *
 * You may replace this platform abstraction but we provide an implementation compatible with any standard JS
 * environment.
 */
export class Time {
    static default: Time;

    static startup = {
        systemMs: 0 as Timestamp,
        processMs: 0 as Timestamp,
    };

    get now() {
        return new Date();
    }
    static get now() {
        return Time.default.now;
    }

    get nowMs() {
        return Date.now();
    }
    static get nowMs() {
        return Time.default.nowMs as Timestamp;
    }

    get nowUs() {
        return Math.floor(performance.now() + performance.timeOrigin) as Timestamp;
    }
    static get nowUs() {
        return Time.default.nowUs;
    }

    /**
     * Create a timer that will call callback after durationMs has passed.
     */
    getTimer(name: string, duration: Duration, callback: Timer.Callback): Timer {
        return new StandardTimer(name, duration, callback, false);
    }
    static readonly getTimer = (name: string, duration: Duration, callback: Timer.Callback): Timer =>
        Time.default.getTimer(name, duration, callback);

    /**
     * Create a timer that will periodically call callback at intervalMs intervals.
     */
    getPeriodicTimer(name: string, duration: Duration, callback: Timer.Callback): Timer {
        return new StandardTimer(name, duration, callback, true);
    }
    static readonly getPeriodicTimer = (name: string, duration: Duration, callback: Timer.Callback): Timer =>
        Time.default.getPeriodicTimer(name, duration, callback);

    /**
     * Create a promise that resolves after a specific interval or when canceled, whichever comes first.
     */
    sleep(name: string, duration: Duration): CancelablePromise {
        let timer: Timer;
        let resolver: () => void;
        return new CancelablePromise(
            resolve => {
                resolver = resolve;
                timer = Time.getTimer(name, duration, resolve);
                timer.start();
            },

            () => {
                timer.stop();
                resolver();
            },
        );
    }
    static sleep(name: string, duration: Duration) {
        return Time.default.sleep(name, duration);
    }

    static register(timer: Timer) {
        registry.add(timer);
        timer.elapsed = Diagnostic.elapsed();
    }

    static unregister(timer: Timer) {
        registry.delete(timer);
    }

    static get timers() {
        return registry;
    }
}

// Check if performance API is available and has the required methods. Use lower accuracy fallback if not.
if (!performance || typeof performance.now !== "function" || typeof performance.timeOrigin !== "number") {
    Object.defineProperty(Time.prototype, "nowUs", {
        get() {
            return Time.nowMs; // Fallback is a bit less accurate
        },
    });
}

export interface Timer {
    /** Name (diagnostics) */
    name: string;

    /** Set to true to indicate the timer should not prevent program exit */
    utility: boolean;

    /** System ID (diagnostics) */
    systemId: unknown;

    /** Interval (diagnostics) */
    interval: Duration;

    /** Is the timer periodic? (diagnostics) */
    isPeriodic: boolean;

    /** Amount of time interval has been active (diagnostics) */
    elapsed?: Diagnostic.Elapsed;

    /** Is true if this timer is running. */
    isRunning: boolean;

    /** Starts this timer, chainable. */
    start(): Timer;

    /** Stops this timer, chainable. */
    stop(): Timer;
}

export namespace Timer {
    export type Callback = () => any;
}

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
            if (!this.isPeriodic) {
                Time.unregister(this);
                this.isRunning = false;
            }
            this.callback();
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

DiagnosticSource.add({
    get [Diagnostic.value]() {
        return Diagnostic.node("⏱", "Timers", {
            children: [...registry].map(timer => [
                timer.name,
                Diagnostic.dict({
                    periodic: timer.isPeriodic,
                    interval: timer.interval,
                    system: timer.systemId,
                    elapsed: timer.elapsed,
                }),
            ]),
        });
    },
});

Boot.init(() => {
    Time.default = new Time();

    Time.startup.systemMs = Time.startup.processMs = Time.nowMs;

    // Hook for testing frameworks
    if (typeof MatterHooks !== "undefined") {
        MatterHooks?.timeSetup?.(Time);
    }
});
