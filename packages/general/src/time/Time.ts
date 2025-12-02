/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagnosticPresentation } from "#log/DiagnosticPresentation.js";
import { NoProviderError } from "#MatterError.js";
import { CancelablePromise } from "#util/Cancelable.js";
import type { Lifetime } from "#util/Lifetime.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { DiagnosticSource } from "../log/DiagnosticSource.js";
import { Duration } from "./Duration.js";
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
    getTimer(_name: string, _duration: Duration, _callback: Timer.Callback): Timer {
        throw new NoProviderError();
    }
    static readonly getTimer = (name: string, duration: Duration, callback: Timer.Callback): Timer =>
        Time.default.getTimer(name, duration, callback);

    /**
     * Create a timer that will periodically call callback at intervalMs intervals.
     */
    getPeriodicTimer(_name: string, _duration: Duration, _callback: Timer.Callback): Timer {
        throw new NoProviderError();
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
                timer = Time.getTimer(name, duration, () => resolve());
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
    export type Callback = (lifetime: Lifetime) => any;
}

DiagnosticSource.add({
    get [DiagnosticPresentation.value]() {
        return Diagnostic.node("⏱", "Timers", {
            children: [...registry].map(timer => [
                timer.name,
                Diagnostic.dict({
                    periodic: timer.isPeriodic,
                    up: timer.elapsed,
                    interval: Duration.format(timer.interval),
                    "system#": timer.systemId,
                }),
            ]),
        });
    },
});
