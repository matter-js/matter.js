/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
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
export class Abort extends Callable<[reason?: Error]> implements AbortController, AbortSignal, PromiseLike<Error> {
    // The native controller implementation
    #controller: AbortController;

    // Optional abort chaining
    #dependents?: AbortSignal[];
    #listener?: (reason: any) => void;

    // Optional PromiseLike behavior
    #aborted?: Promise<Error>;
    #resolve?: (reason: Error) => void;

    // Optional timeout
    #timeout?: Timer;

    constructor({ abort, timeout, handler }: Abort.Options = {}) {
        super(() => this.abort());

        this.#controller = new AbortController();

        const self = (reason?: any) => {
            this.abort(reason);
        };
        Object.setPrototypeOf(self, Object.getPrototypeOf(this));

        if (abort && !Array.isArray(abort)) {
            abort = [abort];
        }

        if (abort?.length) {
            const dependents = abort.map(abort => ("signal" in abort ? abort.signal : abort));
            this.#dependents = dependents;

            this.#listener = (reason: any) => this.abort(reason);
            for (const dependent of dependents) {
                dependent.addEventListener("abort", this.#listener);
            }
        }

        if (timeout) {
            this.#timeout = Time.getPeriodicTimer("subtask timeout", timeout, () => {
                if (this.aborted) {
                    return;
                }

                this.abort(new TimeoutError());
            });

            this.#timeout.start();
        }

        if (handler) {
            this.addEventListener("abort", () => handler(this.reason));
        }
    }

    abort(reason?: any) {
        this.#controller.abort(reason ?? new AbortedError());
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
     * Free resources.
     *
     * You must abort or invoke {@link close} when finished if you construct with {@link Abort.Options#abort} or
     * {@link Abort.Options#timeout}.
     */
    close() {
        this.#timeout?.stop();
        if (this.#listener && this.#dependents) {
            for (const dependent of this.#dependents) {
                dependent.removeEventListener("abort", this.#listener);
            }
        }
    }

    [Symbol.dispose]() {
        this.close();
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
        return asError(this.signal.reason);
    }

    throwIfAborted() {
        this.signal.throwIfAborted();
    }

    then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: Error) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        if (!this.#aborted) {
            this.#aborted = new Promise(resolve => (this.#resolve = resolve));
            this.addEventListener("abort", () => this.#resolve!(asError(this.reason)));
        }
        return this.#aborted.then(onfulfilled, onrejected);
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
        abort?: Signal | Signal[];

        /**
         * An abort timeout.
         *
         * If you specify a timeout, you must either abort or close the {@link Abort}.
         */
        timeout?: Duration;

        /**
         * Adds a default abort handler.
         */
        handler?: (reason?: Error) => void;
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
    export function race<T>(
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

            return SafePromise.race([aborted, ...promises]).finally(off!);
        }

        if (promises.length === 1) {
            return Promise.resolve(promises[0]);
        }

        return SafePromise.race(promises);
    }

    /**
     * Perform abortable sleep.
     */
    export function sleep(description: string, abort: Signal | undefined, duration: Duration) {
        let timer!: Timer;
        const rested = new Promise<void>(resolve => {
            timer = Time.getTimer(description, duration, () => resolve());
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
        if (!signal) {
            return () => {};
        }

        return (signal as AbortSignal).throwIfAborted.bind(signal);
    }
}
