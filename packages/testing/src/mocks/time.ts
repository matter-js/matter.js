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

const macrotaskDependents = new Set<Promise<unknown>>();

const registry = {
    timers: new Set<MockTimer>(),
    register(_timer: MockTimer) {},
    unregister(_timer: MockTimer) {},
};

// Must match matter.js Timer interface
class MockTimer {
    name = "Test";
    systemId = 0;
    intervalMs = 0;
    isPeriodic = false;

    #mockTime: MockTime;
    #duration: number;

    isRunning = false;
    readonly #callback: TimerCallback;

    constructor(mockTime: MockTime, name: string, duration: number, callback: TimerCallback) {
        this.name = name;

        this.#mockTime = mockTime;
        this.#duration = duration;

        if (this instanceof MockInterval) {
            this.#callback = callback;
        } else {
            this.#callback = () => {
                this.#close();
                callback();
            };
        }
    }

    start() {
        registry.register(this);
        this.#mockTime.callbackAtTime(this.#mockTime.nowMs + this.#duration, this.#callback);
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

class MockInterval extends MockTimer {
    constructor(mockTime: MockTime, name: string, duration: number, callback: TimerCallback) {
        const intervalCallback = async () => {
            mockTime.callbackAtTime(mockTime.nowMs + duration, intervalCallback);
            await callback();
        };
        super(mockTime, name, duration, intervalCallback);
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
     * Enable macrotasks (true) or microtasks (false) for mock time incrementation.
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

    requireMacrotasks<T>(dependent: Promise<T>) {
        dependent = dependent.finally(() => macrotaskDependents.delete(dependent));
        macrotaskDependents.add(dependent);
        return dependent;
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

    getTimer(name: string, duration: number, callback: TimerCallback): MockTimer {
        return new MockTimer(this, name, duration, callback);
    },

    getPeriodicTimer(name: string, interval: number, callback: TimerCallback): MockTimer {
        return new MockInterval(this, name, interval, callback);
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
     * Wait for all registered macrotask dependencies to complete.
     */
    get macrotasks() {
        return (async () => {
            while (macrotaskDependents.size) {
                await MockTime.resolve(this.macrotask);
            }
        })();
    },

    /**
     * Resolve a promise with time dependency.
     *
     * Moves time forward until the promise resolves.
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
        while (!resolved) {
            // Macrotasks are necessary for testing code that requires macrotasks, either explicitly or for system logic
            // such as Node's crypto.subtle.  We use macrotasks if enabled explicitly or if aware of pending promises
            // requiring macrotasks
            //
            // TODO - remove manual macrotask control if/when no longer necessary
            if ((macrotasks ?? defaultToMacrotasks) || macrotaskDependents.size) {
                await MockTime.macrotask;
            } else {
                await MockTime.yield();
            }

            if (resolved) {
                break;
            }

            // If we've advanced more than one hour, assume we've hung
            if (timeAdvanced > 60 * 60 * 1000) {
                throw new TestTimeoutError(
                    "Promise did not resolve within one (virtual) hour, probably not going to happen",
                );
            }

            if (stepMs) {
                await this.advance(stepMs);
                timeAdvanced += stepMs;
            } else {
                // Each loop iteration yields to the event loop ~2 times.  Async operations like CASE handshakes
                // require many yields to complete (one per crypto.subtle call), so we need enough iterations before
                // mock-time-based timeouts fire.  With 100ms steps, a 10-second timeout gives ~200 yields, sufficient
                // for any realistic async chain.  The fast macrotask yield (setImmediate/MessageChannel) keeps real
                // wall time negligible even at this granularity.
                await this.advance(100);
                timeAdvanced += 100;
            }

            if (resolved) {
                break;
            }

            await this.yield();
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

        while (callbacks.length) {
            const { atMs, callback } = callbacks[0];
            if (atMs > newTimeMs) break;
            callbacks.shift();
            nowMs = atMs;
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

    Object.defineProperty(time, "macrotask", {
        get() {
            return MockTime.requireMacrotasks(get.apply(time));
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
