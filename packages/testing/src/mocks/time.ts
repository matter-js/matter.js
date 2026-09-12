/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Boot } from "./boot.js";

export class TestTimeoutError extends Error {
    diagnostics;

    constructor(message: string) {
        super(`Test timeout: ${message}`);

        try {
            this.diagnostics = MatterHooks?.generateDiagnostics?.();
        } catch (e) {
            this.diagnostics = `(diagnostics generation failed: ${(e as Error).message}`;
        }
    }

    code?: number | string;
    timeout?: number;
    file?: string;
}

type TimerCallback = () => any;

type MockTimeLike = typeof MockTime;
export interface MockTime extends MockTimeLike {}

/**
 * An operation that only settles on a macrotask boundary.  A "host" dependent additionally settles on host time
 * rather than virtual time, so virtual time must stand still while it is pending.  An abandoned dependent still
 * requires macrotask yields to settle but no longer holds virtual time.
 */
interface Dependent {
    host: boolean;
    yields: number;
    abandoned: boolean;

    /**
     * Turns the entry still withholds virtual time after settling.  Undefined until it settles.
     */
    graceTurns?: number;
}

const dependents = new Map<Promise<unknown>, Dependent>();

/**
 * Yields a single host operation may withhold virtual time for.  The budget is per operation, so a slow operation
 * cannot spend the budget of one that starts alongside it.  An operation over budget is abandoned: it still requires
 * macrotask yields to settle but no longer withholds virtual time, so an operation that never settles costs one
 * bounded delay rather than a stalled clock.
 */
const MAX_HOST_ASYNC_YIELDS = 200;

/**
 * Iterations of {@link MockTime.resolve} between visits to the host's task queue once it is driving the clock.  Work
 * the host owns cannot progress during a microtask-only loop, so this bounds how much virtual time a continuation
 * parked on the host can cost.
 */
const HOST_TURNS_EVERY = 4;

/**
 * Turns a host operation keeps withholding virtual time after it settles.  Its continuation resumes a microtask from
 * now and usually starts the next operation, so without this bridge the handover reads as idle and costs a step.
 */
const HOST_SETTLE_GRACE_TURNS = 2;

function register<T>(dependent: Promise<T>, host: boolean) {
    const registered = dependent.finally(() => {
        const entry = dependents.get(registered);
        if (entry === undefined) {
            return;
        }

        if (entry.host && !entry.abandoned) {
            entry.graceTurns = HOST_SETTLE_GRACE_TURNS;
            return;
        }

        dependents.delete(registered);
    });
    dependents.set(registered, { host, yields: 0, abandoned: false });
    return registered;
}

/**
 * The uninstrumented macrotask of each instrumented implementation.  {@link instrumentImplementation} replaces the
 * public getter with one that registers a dependent, which is right for callers but wrong for MockTime's own waits.
 */
const uninstrumentedMacrotasks = new WeakMap<TimeLike, () => Promise<void>>();

/**
 * Yield to the host's task queue without registering a dependent, so a wait performed by {@link MockTime} itself does
 * not read as work in progress.  Falls back to a microtask where no implementation is installed, which is the most
 * MockTime can do on its own.
 */
function hostTurn() {
    const macrotask = real === undefined ? undefined : uninstrumentedMacrotasks.get(real);
    return macrotask === undefined ? Promise.resolve() : macrotask();
}

/**
 * The waiter currently charging the budget.  Waits nest and overlap, so without a single charger per yield an
 * operation's budget would drain once per concurrent waiter rather than once per yield.
 */
let charger: object | undefined;

/**
 * Host operations abandoned since the last {@link MockTime.reset}.  Any count above zero means virtual time inflated
 * with host latency, so a test that fails on protocol timing should be read in that light.
 */
let abandonedHostAsyncOps = 0;

/**
 * Report whether virtual time must stand still for a pending host operation.  The waiter that owns the budget also
 * charges one yield to each such operation and abandons those over budget.
 */
function withholdVirtualTime(waiter: object) {
    if (charger === undefined) {
        charger = waiter;
    }
    const charging = charger === waiter;

    let withholding = false;
    for (const [promise, dependent] of dependents) {
        if (!dependent.host || dependent.abandoned) {
            continue;
        }

        // A settled operation bridges the handover to its continuation, then leaves.  Only the charger spends the
        // bridge, so overlapping waits cannot drain it faster than one turn at a time
        if (dependent.graceTurns !== undefined) {
            if (charging) {
                if (dependent.graceTurns === 0) {
                    dependents.delete(promise);
                    continue;
                }
                dependent.graceTurns--;
            }
            withholding = true;
            continue;
        }

        if (charging) {
            if (dependent.yields >= MAX_HOST_ASYNC_YIELDS) {
                dependent.abandoned = true;
                abandonedHostAsyncOps++;

                // Virtual time inflates with host latency again from here, which is the defect this budget exists to
                // contain, so an abandonment must not pass unnoticed
                console.warn(
                    `MockTime abandoned a host operation pending for ${MAX_HOST_ASYNC_YIELDS} yields; virtual time may now inflate with host latency`,
                );
                continue;
            }
            dependent.yields++;
        }
        withholding = true;
    }
    return withholding;
}

function releaseCharger(waiter: object) {
    if (charger === waiter) {
        charger = undefined;
    }
}

/**
 * Drop the bridge entries of operations that have settled.  The bridge only exists to carry a handover inside a wait,
 * so it must not outlive the wait that created it.
 */
function forgetGracedDependents() {
    for (const [promise, dependent] of dependents) {
        if (dependent.graceTurns !== undefined) {
            dependents.delete(promise);
        }
    }
}

function hasActiveDependents() {
    for (const dependent of dependents.values()) {
        if (!dependent.abandoned && dependent.graceTurns === undefined) {
            return true;
        }
    }
    return false;
}

const timerNames = new WeakMap<TimerCallback, string>();

const registry = {
    timers: new Set<MockTimer>(),
    register(_timer: MockTimer) {},
    unregister(_timer: MockTimer) {},
};

// Must match matter.js Timer interface
class MockTimer {
    name = "Test";
    systemId = 0;
    utility = false;
    readonly isPeriodic: boolean;

    #mockTime: MockTime;
    #interval = 0;
    #armedInterval = 0;

    isRunning = false;
    readonly #callback: TimerCallback;

    constructor(mockTime: MockTime, name: string, duration: number, callback: TimerCallback, isPeriodic = false) {
        this.name = name;
        this.isPeriodic = isPeriodic;

        this.#mockTime = mockTime;
        this.interval = duration;

        if (isPeriodic) {
            this.#callback = async () => {
                this.#mockTime.callbackAtTime(this.#mockTime.nowMs + this.#armedInterval, this.#callback);
                await callback();
            };
        } else {
            this.#callback = () => {
                this.#close();
                callback();
            };
        }
    }

    /**
     * The timer's interval.
     *
     * As with the production implementation, changes have no effect until the timer restarts.
     */
    set interval(interval: number) {
        if (interval < 0 || interval > 2147483647) {
            throw new Error(
                `Invalid intervalMs: ${interval}. The value must be between 0 and 32-bit maximum value (2147483647)`,
            );
        }
        this.#interval = interval;
    }

    get interval() {
        return this.#interval;
    }

    start() {
        if (this.isRunning) {
            this.stop();
        }
        registry.register(this);
        timerNames.set(this.#callback, `${this.name}(${this.#interval}${this.isPeriodic ? ",periodic" : ""})`);
        this.#armedInterval = this.#interval;
        this.#mockTime.callbackAtTime(this.#mockTime.nowMs + this.#armedInterval, this.#callback);
        this.isRunning = true;
        return this;
    }

    stop() {
        this.#close();
        return this;
    }

    #close() {
        registry.unregister(this);
        this.#mockTime.removeCallback(this.#callback);
        this.isRunning = false;
    }
}

type InterceptResult<T> =
    T extends Promise<T>
        ? { resolve: Awaited<T>; reject?: undefined } | { resolve?: undefined; reject: {} }
        : { resolve: T; reject?: undefined } | { resolve?: void; reject: {} };

function isAsync(fn: (...args: any) => any): fn is (...args: any) => Promise<any> {
    return fn.constructor.name === "AsyncFunction";
}

interface TimeLike {
    macrotask: Promise<void>;
    sleep(name: string, duration: number): Promise<unknown>;
}

interface StaticTimeLike {
    startup: { systemMs: number; processMs: number };
    default: TimeLike;
    register(timer: MockTimer): void;
    unregister(timer: MockTimer): void;
    timers: Set<MockTimer>;
}

let callbacks = new Array<{ atMs: number; callback: TimerCallback }>();
let nowMs = 0;
let real = undefined as undefined | TimeLike;
let enabled = false;
let defaultToMacrotasks = false;

const instrumentedImplementations = new WeakSet<TimeLike>();

/**
 * An arbitrary start for our mock timeline.  Starting at zero causes problems with Matter dates that cannot encode back
 * to the UNIX epoch
 */
const epoch = new Date("2025-01-01 12:34:56Z");

// Must match matter.js Time interface (with extensions)
export const MockTime = {
    epoch,

    get activeImplementation(): TimeLike {
        return enabled ? this : (real ?? this);
    },

    /**
     * Revert to standard time implementation.
     */
    disable() {
        enabled = false;
        installActiveImplementation?.();
    },

    /**
     * Enable time mocking.  Reverts to disabled for each test file.
     */
    enable() {
        enabled = true;
        installActiveImplementation?.();
    },

    /**
     * Sets mock time to specific time and enable the mock.
     */
    reset(time: ConstructorParameters<typeof Date>[0] = epoch) {
        callbacks = [];
        dependents.clear();
        abandonedHostAsyncOps = 0;
        nowMs = new Date(time).getTime();
        defaultToMacrotasks = false;
        MockTime.enable();
    },

    /**
     * Enable and reset if not already enabled.
     */
    init() {
        if (!enabled) {
            MockTime.enable();
        }
    },

    /**
     * Enable macrotasks (true) or microtasks (false) as the default yield for mock time incrementation.
     *
     * Microtasks are the default and are more efficient.  Macrotasks are required for e.g. most of node's crypto.subtle
     * methods to resolve.
     */
    get forceMacrotasks() {
        return defaultToMacrotasks;
    },

    set forceMacrotasks(value: boolean) {
        defaultToMacrotasks = value;
    },

    /**
     * Register an operation that settles on host time rather than virtual time.  {@link MockTime.resolve} withholds
     * virtual time for the duration of the operation, so host latency does not expire virtual timers.  Time still
     * advances in gaps between operations and once an operation exhausts {@link MAX_HOST_ASYNC_YIELDS}.
     */
    requireHostAsync<T>(dependent: Promise<T>) {
        return register(dependent, true);
    },

    requireMacrotasks<T>(dependent: Promise<T>) {
        return register(dependent, false);
    },

    /**
     * The largest yield count charged to a pending host operation.  Exposed for tests of MockTime itself.
     */
    get hostAsyncYieldsCharged() {
        let yields = 0;
        for (const dependent of dependents.values()) {
            if (dependent.host && dependent.yields > yields) {
                yields = dependent.yields;
            }
        }
        return yields;
    },

    /**
     * Turns between visits to the host's task queue once the clock is moving.  Exposed for tests of MockTime itself.
     */
    get hostTurnInterval() {
        return HOST_TURNS_EVERY;
    },

    /**
     * Host operations abandoned since the last {@link MockTime.reset}.  Exposed for tests of MockTime itself.
     */
    get abandonedHostAsyncOps() {
        return abandonedHostAsyncOps;
    },

    /**
     * Operations {@link MockTime} still tracks, abandoned ones included.  Exposed for tests of MockTime itself.
     */
    get dependentCount() {
        return dependents.size;
    },

    /**
     * Host operations currently withholding virtual time.  Exposed for tests of MockTime itself.
     */
    get pendingHostAsyncOps() {
        let count = 0;
        for (const dependent of dependents.values()) {
            if (dependent.host && !dependent.abandoned && dependent.graceTurns === undefined) {
                count++;
            }
        }
        return count;
    },

    atTime<T>(time: number | Date, actor: () => T): T {
        const revertTo = nowMs;
        let isAsync = false;
        try {
            nowMs = typeof time === "number" ? time : time.getTime();
            const result = actor();
            if (typeof (result as any)?.then === "function") {
                isAsync = true;
                return Promise.resolve(result).finally(() => {
                    nowMs = revertTo;
                }) as T;
            }
            return result;
        } finally {
            if (!isAsync) {
                nowMs = revertTo;
            }
        }
    },

    get now(): Date {
        return new Date(nowMs);
    },

    get nowMs() {
        return nowMs;
    },

    get nowUs() {
        return nowMs;
    },

    getTimer(name: string, duration: number, callback: TimerCallback): MockTimer {
        return new MockTimer(this, name, duration, callback);
    },

    getPeriodicTimer(name: string, interval: number, callback: TimerCallback): MockTimer {
        return new MockTimer(this, name, interval, callback, true);
    },

    /**
     * Time compatible sleep.
     *
     * This passes the sleep call through to the (possibly mocked) underlying time implementation.
     */
    sleep(name: string, duration: number) {
        if (real === undefined) {
            throw new Error("Cannot sleep because time implementation is not present");
        }
        return real.sleep(name, duration);
    },

    /**
     * Use the installed time implementation to yield to the next macrotask.
     *
     * We do not mock macrotasks because it keeps tests truer to life and unlike timers it does not have a meaningful
     * impact on test execution.
     */
    get macrotask() {
        if (real === undefined) {
            throw new Error("Cannot create macrotask because time implementation is not present");
        }
        return real.macrotask;
    },

    /**
     * Wait for all registered macrotask dependencies to complete.  A host dependency over budget is abandoned here as
     * it is in {@link MockTime.resolve}, so one that never settles cannot stall the wait.
     */
    get macrotasks() {
        return (async () => {
            const waiter = {};
            try {
                while (hasActiveDependents()) {
                    await MockTime.resolve(this.macrotask);
                    withholdVirtualTime(waiter);
                }
            } finally {
                releaseCharger(waiter);
            }
        })();
    },

    /**
     * Resolve a promise with time dependency.
     *
     * Moves time forward until the promise resolves.  Pass `macrotasks` to visit the host's task queue on every turn
     * rather than only while work is registered or, once the clock is moving, every {@link HOST_TURNS_EVERY} turns.
     */
    async resolve<T>(
        promise: PromiseLike<T> | T,
        { stepMs, macrotasks }: { stepMs?: number; macrotasks?: boolean } = {},
    ) {
        let resolved = false;
        let result: T | undefined;
        let error: any;

        if (
            typeof promise !== "object" ||
            promise === null ||
            !("then" in promise) ||
            typeof promise.then !== "function"
        ) {
            return promise;
        }

        promise.then(
            r => {
                resolved = true;
                result = r;
            },
            e => {
                resolved = true;
                error = e;
            },
        );

        let timeAdvanced = 0;
        let turns = 0;
        let advanced = false;
        const waiter = {};

        try {
            while (!resolved) {
                // Microtask yields keep the loop cheap, but only the host's task queue lets real work (I/O, timers
                // the host owns) make progress, so visit it while nothing is registered too
                if (
                    (macrotasks ?? defaultToMacrotasks) ||
                    dependents.size ||
                    (advanced && turns % HOST_TURNS_EVERY === 0)
                ) {
                    await hostTurn();
                } else {
                    await MockTime.yield();
                }
                turns++;

                if (resolved) {
                    break;
                }

                // If we've advanced more than one hour, assume we've hung
                if (timeAdvanced > 60 * 60 * 1000) {
                    throw new TestTimeoutError(
                        "Promise did not resolve within one (virtual) hour, probably not going to happen",
                    );
                }

                // Host operations such as crypto settle on host time.  Advancing while one is pending converts host
                // latency into virtual time, which expires protocol timers that would not expire in production
                if (withholdVirtualTime(waiter)) {
                    continue;
                }

                if (stepMs) {
                    await this.advance(stepMs);
                    timeAdvanced += stepMs;
                } else {
                    // 100ms steps give ~200 yields before a 10-second mock timeout fires, sufficient for realistic
                    // async chains
                    await this.advance(100);
                    timeAdvanced += 100;
                }
                advanced = true;

                if (resolved) {
                    break;
                }

                await this.yield();
            }
        } finally {
            releaseCharger(waiter);
            if (charger === undefined) {
                forgetGracedDependents();
            }
        }

        if (error !== undefined) {
            throw error;
        }

        return result as T;
    },

    /**
     * Move time forward.  Runs tasks scheduled during this interval.
     */
    async advance(ms: number) {
        const newTimeMs = nowMs + ms;

        let previousAtMs: number | undefined;
        let iterationsAtSameTime = 0;
        while (callbacks.length) {
            const { atMs, callback } = callbacks[0];
            if (atMs > newTimeMs) break;
            callbacks.shift();
            nowMs = atMs;

            // A timer that rearms at the current time never lets the mock clock advance, so without this guard the
            // loop spins indefinitely
            iterationsAtSameTime = atMs === previousAtMs ? iterationsAtSameTime + 1 : 0;
            previousAtMs = atMs;
            if (iterationsAtSameTime > 10000) {
                throw new TestTimeoutError(
                    `Timer ${timerNames.get(callback) ?? "(unknown)"} rearms without advancing mock time`,
                );
            }

            await callback();
        }

        nowMs = newTimeMs;
    },

    /**
     * Yield to scheduled microtasks.  This means that all code paths waiting on resolved promises (including await)
     * will proceed before this method returns.
     */
    async yield() {
        await Promise.resolve();
    },

    /**
     * Due to its implementation, an older version of yield() would actually yield to microtasks three times.  Our tests
     * then depended on this functionality -- one yield could trigger up to three nested awaits.
     *
     * To make this clear, the version of yield() that emulates old behavior is called "yield3".
     */
    async yield3() {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    },

    /**
     * Hook a method and invoke a callback just before the method completes. Unhooks after completion.
     *
     * Handles both synchronous and asynchronous methods.  The responseInterceptor should match the async-ness of the
     * intercepted method.
     *
     * The responseInterceptor can optionally access and/or replace the resolve/reject value.
     * The callInterceptor can be used to manipulate the call parameters of the method
     */
    interceptOnce<NameT extends string, ReturnT, ObjT extends { [N in NameT]: (...args: any) => ReturnT }>(
        obj: ObjT,
        method: NameT,
        responseInterceptor: (
            result: InterceptResult<ReturnT>,
        ) => void | InterceptResult<ReturnT> | Promise<void> | Promise<InterceptResult<ReturnT>>,
        callInterceptor?: (args: Parameters<ObjT[NameT]>) => Parameters<ObjT[NameT]>,
    ) {
        const original = obj[method];
        if (!original) {
            throw new Error(`Interception method ${method} is not present`);
        }
        let result: InterceptResult<ReturnT>;
        if (isAsync(responseInterceptor)) {
            obj[method] = async function (this: any, ...args: any): Promise<any> {
                if (callInterceptor) {
                    args = callInterceptor(args);
                }
                try {
                    const resolve = await original.apply(this, args);
                    result = { resolve } as any;
                } catch (reject) {
                    result = { reject } as any;
                } finally {
                    obj[method] = original;
                }
                result = (await responseInterceptor(result)) ?? result;
                if (result.reject) {
                    throw result.reject as Error;
                }
                return result.resolve;
            } as any;
        } else {
            obj[method] = function (this: any, ...args: any): any {
                if (callInterceptor) {
                    args = callInterceptor(args);
                }
                try {
                    const resolve = original.apply(this, args);
                    result = { resolve } as any;
                } catch (reject) {
                    result = { reject } as any;
                } finally {
                    obj[method] = original;
                }
                result = (responseInterceptor(result) as any) ?? result;
                if (result.reject) {
                    throw result.reject as Error;
                }
                return result.resolve;
            } as any;
        }
    },

    /**
     * Count the number of registered timers with a specific name.
     */
    timerCountFor(name: string) {
        return [...registry.timers].filter(timer => timer.name === name).length;
    },

    callbackAtTime(atMs: number, callback: TimerCallback) {
        // Encountered this in chromium web tests and reproduced in chrome.  But adding this test fixes it, so maybe a
        // chrome v8 error?  If it triggers again note the stack trace
        if (!Number.isInteger(atMs)) {
            throw new Error(`Callback registered at non-integer time ${atMs}`);
        }

        callbacks.push({ atMs, callback });
        callbacks.sort(({ atMs: atMsA }, { atMs: atMsB }) => atMsA - atMsB);
    },

    removeCallback(callbackToRemove: TimerCallback) {
        const index = callbacks.findIndex(({ callback }) => callbackToRemove === callback);
        if (index === -1) return;
        callbacks.splice(index, 1);
    },
};

let installActiveImplementation: undefined | (() => void);

export function timeSetup(Time: StaticTimeLike) {
    registry.register = Time.register;
    registry.unregister = Time.unregister;
    registry.timers = Time.timers;
    Time.startup.systemMs = Time.startup.processMs = 0;
    real = Time.default;
    instrumentImplementation(real);
    installActiveImplementation = () => (Time.default = MockTime.activeImplementation);
    installActiveImplementation();
}

function instrumentImplementation(time: TimeLike) {
    if (instrumentedImplementations.has(time)) {
        return;
    }

    let get;
    let obj = time;
    while (obj) {
        get = Object.getOwnPropertyDescriptor(obj.constructor.prototype, "macrotask")?.get;
        if (get) {
            break;
        }
        obj = Object.getPrototypeOf(obj);
    }
    if (!get) {
        throw new Error("Time instance does not define macrotask getter");
    }

    const uninstrumented = get;
    uninstrumentedMacrotasks.set(time, () => uninstrumented.apply(time));

    Object.defineProperty(time, "macrotask", {
        get() {
            return MockTime.requireMacrotasks(uninstrumented.apply(time));
        },
    });

    instrumentedImplementations.add(time);
}

Object.assign(globalThis, { MockTime });

Boot.init(kind => {
    if (kind === "state") {
        return;
    }

    MockTime.reset();
    MockTime.disable();
});
