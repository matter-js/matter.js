/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbortedError, TimeoutError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";
import { asError } from "./Error.js";
import { Callable } from "./Function.js";
import { SafePromise } from "./Promises.js";

/**
 * Convenience abort implementation.
 *
 * Acts as both an {@link AbortController} and {@link AbortSignal}.
 *
 * May be awaited like a promise, although it returns the {@link reason} rather than throwing.
 *
 * May be invoked as a function to perform abort.
 *
 * Optionally will register for abort with an outer {@link AbortController} and/or add a timeout.  You must abort or
 * invoke {@link close} if you use either of these options.
 */
export class Abort
    extends Callable<[reason?: string | Error]>
    implements AbortController, AbortSignal, PromiseLike<Error>
{
    // The native controller implementation
    #controller: AbortController;

    // Optional abort chaining
    #unregisterDependencies?: () => void;

    // Optional PromiseLike behavior
    #aborted?: Promise<Error>;
    #resolve?: (reason: Error) => void;

    // Optional timeout
    #timeout?: Timer;

    constructor({ abort: aborts, timeout, handler, timeoutHandler }: Abort.Options = {}) {
        const abort = (reason?: Error | string) => {
            if (typeof reason === "string") {
                reason = new AbortedError(reason);
            }
            this.abort(reason);
        };

        super(abort);

        this.#controller = new AbortController();

        const throwIfAborted = this.#controller.signal.throwIfAborted.bind(this.#controller.signal);
        this.#controller.signal.throwIfAborted = () => {
            try {
                throwIfAborted();
            } catch (reason) {
                throw createAbortError(reason);
            }
        };

        const self = (reason?: any) => {
            this.abort(reason);
        };
        Object.setPrototypeOf(self, Object.getPrototypeOf(this));

        if (aborts && !Array.isArray(aborts)) {
            aborts = [aborts];
        }

        if (aborts?.length) {
            const dependencies = aborts.map(abort => abort && ("signal" in abort ? abort.signal : abort));

            for (const dependency of dependencies) {
                if (dependency === undefined) {
                    continue;
                }

                // If the dependency is already aborted, propagate immediately
                if (dependency.aborted) {
                    this.abort(asError(dependency.reason));
                    continue;
                }

                const listener = () => this.abort(asError(dependency.reason));
                dependency.addEventListener("abort", listener);
                const unregisterPrev = this.#unregisterDependencies;
                this.#unregisterDependencies = () => {
                    unregisterPrev?.();
                    dependency.removeEventListener("abort", listener);
                };
            }
        }

        if (timeout !== undefined) {
            if (timeoutHandler) {
                const original = timeoutHandler;
                timeoutHandler = () => {
                    try {
                        original.call(this);
                    } catch (e) {
                        this.abort(asError(e));
                    }
                };
            } else {
                timeoutHandler = () => this.abort(new TimeoutError());
            }

            if (timeout <= 0) {
                // Defer to the next microtask so any already-pending promise has a chance to resolve
                Promise.resolve().then(() => {
                    if (!this.aborted) {
                        timeoutHandler!.call(this);
                    }
                });
            } else {
                this.#timeout = Time.getTimer("subtask timeout", timeout, () => {
                    if (this.aborted) {
                        return;
                    }

                    timeoutHandler!.call(this);
                });

                this.#timeout.start();
            }
        }

        if (handler) {
            if (this.aborted) {
                handler.call(this, this.reason);
            } else {
                this.addEventListener("abort", () => handler.call(this, this.reason));
            }
        }
    }

    abort(reason?: Error | string) {
        if (typeof reason === "string") {
            reason = new AbortedError(reason);
        }
        this.#controller.abort(reason ?? new AbortedError("Operation aborted with no reason given"));
    }

    get signal() {
        return this.#controller.signal;
    }

    /**
     * Race one or more promises with my abort signal.
     *
     * If aborted returns undefined.
     */
    async race<T>(...promises: Array<T | PromiseLike<T>>): Promise<Awaited<T> | void> {
        return Abort.race(this, ...promises);
    }

    /**
     * Race with throw on abort.
     */
    async attempt<T>(...promises: Array<T | PromiseLike<T>>) {
        return await Abort.attempt(this, ...promises);
    }

    /**
     * Free resources.
     *
     * You must abort or invoke {@link close} when finished if you construct with {@link Abort.Options#abort} or
     * {@link Abort.Options#timeout}.
     */
    close() {
        this.#timeout?.stop();
        this.#unregisterDependencies?.();
    }

    [Symbol.dispose]() {
        this.close();
    }

    if(condition?: unknown, reason?: Error) {
        if (condition) {
            this.abort(reason);
        }
    }

    get aborted() {
        return this.signal.aborted;
    }

    set onabort(onabort: ((this: AbortSignal, ev: Event) => any) | null) {
        this.signal.onabort = onabort;
    }

    get onabort() {
        return this.signal.onabort;
    }

    get reason() {
        return this.signal.reason;
    }

    throwIfAborted() {
        this.signal.throwIfAborted();
    }

    async then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: Error) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        if (!this.#aborted) {
            if (this.#controller.signal.aborted) {
                return Promise.resolve(asError(this.#controller.signal.reason)).then(onfulfilled, onrejected);
            }
            this.#aborted = new Promise(resolve => (this.#resolve = resolve));
            this.addEventListener("abort", () => {
                this.#resolve!(asError(this.signal.reason));
            });
        }
        return await this.#aborted.then(onfulfilled, onrejected);
    }

    addEventListener<K extends keyof AbortSignalEventMap>(
        type: K,
        listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(type: any, listener: any, options?: any) {
        this.signal.addEventListener(type, listener, options);
    }

    removeEventListener<K extends keyof AbortSignalEventMap>(
        type: K,
        listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(type: any, listener: any, options?: any) {
        this.signal.addEventListener(type, listener, options);
    }

    dispatchEvent(event: Event) {
        return this.signal.dispatchEvent(event);
    }
}

/**
 * Utilities for implementing abort logic.
 */
export namespace Abort {
    /**
     * Optional configuration for {@link Abort}.
     */
    export interface Options {
        /**
         * One or more parent abort signals.
         *
         * If a parent aborts, this {@link Abort} will abort as well.  However the inverse is not true, so this task is
         * independently abortable.
         *
         * This functions similarly to {@link AbortSignal.any} but has additional protection against memory leaks.
         */
        abort?: Signal | (Signal | undefined)[];

        /**
         * An abort timeout.
         *
         * If you specify a timeout, you must either abort or close the {@link Abort}.
         */
        timeout?: Duration;

        /**
         * Adds a default abort handler.
         */
        handler?: (this: Abort, reason?: Error) => void;

        /**
         * Replaces the default timeout handler.
         *
         * The default implementation aborts with {@link TimeoutError}.
         */
        timeoutHandler?: (this: Abort) => void;
    }

    /**
     * An entity that may be used to signal abort of an operation.
     */
    export type Signal = AbortController | AbortSignal;

    /**
     * Determine whether a {@link Signal} is aborted.
     */
    export function is(signal: Signal | undefined) {
        if (!signal) {
            return;
        }

        if ("signal" in signal) {
            signal = signal.signal;
        }

        return signal.aborted;
    }

    /**
     * Race one or more promises with an optional abort signal.
     *
     * If the abort signal is present and signals abort, the race will end and return undefined.  It will not throw the
     * abort reason.
     */
    export async function race<T>(
        signal: Signal | undefined,
        ...promises: Array<T | PromiseLike<T>>
    ): Promise<Awaited<T> | void> {
        if (signal) {
            if ("signal" in signal) {
                signal = signal.signal;
            }

            let off: () => void;
            const aborted = new Promise<void>(resolve => {
                const onabort = () => resolve();
                (signal as AbortSignal).addEventListener("abort", onabort);
                off = () => (signal as AbortSignal).removeEventListener("abort", onabort);
            });

            try {
                return await SafePromise.race([aborted, ...promises]);
            } finally {
                off!();
            }
        }

        if (promises.length === 1) {
            return await Promise.resolve(promises[0]);
        }

        return await SafePromise.race(promises);
    }

    /**
     * Race with throw on abort.
     */
    export async function attempt<T>(signal: Signal | undefined, ...promises: Array<T | PromiseLike<T>>) {
        if (signal && "signal" in signal) {
            signal = signal.signal;
        }
        const result = await race(signal, ...promises);
        signal?.throwIfAborted();
        return result as Awaited<T>;
    }

    /**
     * Perform abortable sleep.
     */
    export function sleep(description: string, abort: Signal | undefined, duration: Duration) {
        let timer!: Timer;
        const rested = new Promise<void>(resolve => {
            timer = Time.getTimer(description, duration, () => resolve()).start();
        });
        return race(abort, rested).finally(timer.stop.bind(timer));
    }

    /**
     * Create independently abortable subtask with a new {@link AbortController} that is aborted if another controller
     * aborts.
     *
     * Closing the returned controller unregisters with the input controller.  It does not perform an abort.
     *
     * {@link timeout} is a convenience for adding a timeout.
     */
    export function subtask(signal: Signal | undefined, timeout?: Duration): Abort {
        return new Abort({ abort: signal, timeout });
    }

    /**
     * Like {@link AbortSignal.any} but does not leak memory so long as the returned {@link Abort} is aborted or closed.
     */
    export function any(...signals: (Signal | undefined)[]) {
        return new Abort({ abort: [...(signals.filter(signal => signal) as Signal[])] });
    }

    /**
     * Generate a function that will throw if aborted.
     */
    export function checkerFor(signal?: Signal | { abort?: Signal }) {
        if (!signal) {
            return () => {};
        }

        if ("abort" in signal && typeof signal.abort === "object") {
            signal = signal.abort;
        }
        if (!signal) {
            return () => {};
        }

        if ("signal" in signal) {
            signal = signal.signal;
        }
        if (!signal || !("throwIfAborted" in signal)) {
            return () => {};
        }

        return signal.throwIfAborted.bind(signal);
    }
}

function createAbortError(reason: unknown) {
    const error = new AbortedError();

    // Remove stack lines for this abort logic
    const stack = error.stack?.split("\n");

    // Leave the message but remove top two frames (this function + caller in Abort)
    stack?.splice(1, 2);

    error.stack = stack?.join("\n");

    error.cause = asError(reason);
    return error;
}
