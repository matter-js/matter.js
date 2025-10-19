/**
 * Utils for promises.
 *
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { asError } from "#util/Error.js";
import { InternalError, TimeoutError } from "../MatterError.js";
import { Time } from "../time/Time.js";

/**
 * Obtain a promise with functions to resolve and reject.
 */
export function createPromise<T>(): {
    promise: Promise<T>;
    resolver: (value: T) => void;
    rejecter: (reason?: any) => void;
} {
    let resolver, rejecter;
    const promise = new Promise<T>((resolve, reject) => {
        resolver = resolve;
        rejecter = reject;
    });

    if (!resolver || !rejecter) {
        // This doesn't happen but asserts that resolver and rejecter are defined.
        throw new InternalError("Failed to extract resolve/reject from Promise context");
    }

    return {
        promise,
        resolver,
        rejecter,
    };
}

/**
 * Use all promises or promise returning methods and return the first resolved promise or reject when all promises
 * rejected
 */
export function anyPromise<T>(promises: ((() => Promise<T>) | Promise<T>)[]): Promise<T> {
    return new Promise((resolve, reject) => {
        let numberRejected = 0;
        let wasResolved = false;
        for (const entry of promises) {
            const promise = typeof entry === "function" ? entry() : entry;
            promise
                .then(value => {
                    if (!wasResolved) {
                        wasResolved = true;
                        resolve(value);
                    }
                })
                .catch(reason => {
                    numberRejected++;
                    if (!wasResolved && numberRejected === promises.length) {
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(reason);
                    }
                });
        }
    });
}

/**
 * Thrown when a timed promise times out.
 */
export class PromiseTimeoutError extends TimeoutError {}

/**
 * Create a promise with a timeout.
 *
 * By default, rejects with {@link PromiseTimeoutError} on timeout but you can override by supplying {@link cancel}.
 *
 * @param timeout the timeout in milliseconds
 * @param promise a promise that resolves or rejects when the timed task completes
 * @param cancel invoked on timeout (default implementation throws {@link PromiseTimeoutError})
 */
export async function withTimeout<T>(
    timeout: Duration,
    promise: Promise<T>,
    cancel?: AbortController | (() => void),
): Promise<T> {
    let cancelFn;
    if (typeof cancel === "function") {
        cancelFn = cancel;
    } else if (typeof cancel?.abort === "function") {
        cancelFn = () => cancel.abort();
    } else {
        cancelFn = () => {
            throw new PromiseTimeoutError();
        };
    }

    let cancelTimer: undefined | (() => void);

    // Sub-promise 1, the timer
    const timedOut = new Promise<void>((resolve, reject) => {
        const timer = Time.getTimer("promise-timeout", timeout, () => {
            try {
                cancelFn();
            } catch (e) {
                reject(asError(e));
                return;
            }
        });

        cancelTimer = () => {
            timer.stop();
            resolve();
        };

        timer.start();
    });

    let result: undefined | T;

    // Sub-promise 2, captures result and cancels timer
    const producer = promise.then(
        r => {
            cancelTimer?.();
            result = r;
        },
        e => {
            cancelTimer?.();
            throw e;
        },
    );

    // Output promise, resolves like input promise unless timed out
    await Promise.all([timedOut, producer]);

    return result as T;
}

/**
 * Return type for functions that are optionally asynchronous.
 *
 * TODO - as currently defined MaybePromise of a Promise incorrectly wraps as a Promise of a Promise
 */
export type MaybePromise<T = void> = T | PromiseLike<T>;

/**
 * Promise-like version of above.
 */
export type MaybePromiseLike<T = void> = T | PromiseLike<T>;

export const MaybePromise = {
    /**
     * Determine whether a {@link MaybePromiseLike} is a {@link Promise}.
     */
    is<T>(value: MaybePromise<T>): value is PromiseLike<T> {
        // We cannot use isObject because this could collide with valid values here
        return (
            typeof value === "object" &&
            value !== null &&
            typeof (value as { then?: unknown }).then === "function" &&
            value !== this
        );
    },

    /**
     * Chained MaybePromise.  Invokes the resolve function immediately if the {@link MaybePromise} is not a
     * {@link Promise}, otherwise the same as a normal {@link Promise.then}.
     */
    then<I, O1 = never, O2 = never>(
        producer: MaybePromise<I> | (() => MaybePromise<I>),
        resolve?: ((input: I) => MaybePromise<O1>) | null,
        reject?: ((error: any) => MaybePromise<O2>) | null,
    ): MaybePromise<O1 | O2> {
        let rejected = false;

        try {
            let value;
            if (producer instanceof Function) {
                value = producer();
            } else {
                value = producer;
            }
            if (MaybePromise.is(value)) {
                return value.then(
                    resolve,
                    reject
                        ? error => {
                              // If reject() is not async then we will catch rejection errors below but should not
                              // reject again
                              rejected = true;

                              return reject?.(error);
                          }
                        : undefined,
                );
            }
            if (resolve) {
                return resolve(value);
            }
        } catch (e) {
            if (reject && !rejected) {
                return reject(e);
            }
            throw e;
        }

        // Make TypeScript happy
        return undefined as MaybePromise<O1 | O2>;
    },

    /**
     * Equivalent of {@link Promise.catch}.
     */
    catch<T, TResult = never>(
        producer: MaybePromise<T> | (() => MaybePromise<T>),
        onrejected?: ((reason: any) => MaybePromise<TResult>) | null,
    ) {
        return this.then(producer, undefined, onrejected);
    },

    /**
     * Equivalent of {@link Promise.finally}.
     */
    finally<T>(
        producer: MaybePromise<T> | (() => MaybePromise<T>),
        onfinally?: (() => MaybePromise<void>) | null,
    ): MaybePromise<T> {
        let result: MaybePromise<T> | undefined;
        try {
            if (typeof producer === "function") {
                result = (producer as () => MaybePromise<T>)();
            } else {
                result = producer;
            }
        } finally {
            if (MaybePromise.is(result)) {
                // Use native finally or fake via then
                if (typeof (result as Promise<any>).finally === "function") {
                    // TypeScript's types are wrong for finally, they specify the callback as () => void rather than
                    // accepting a promise return.  TS itself somehow doesn't mind this because a function returning
                    // something can be assigned to a promise returning void.
                    //
                    // The TS folks rationalize this here:
                    //
                    //      https://github.com/microsoft/TypeScript/issues/44980
                    //
                    // Eslint used to work around this sometimes (was never sure when or whether it was intentional) but
                    // something broke when we updated typescript-eslint to 7.1.1.
                    //
                    // The eslint folks blow this off here.  Includes a comment referencing a TS playground that
                    // demonstrates eslint behavior is incorrect:
                    //
                    //      https://github.com/typescript-eslint/typescript-eslint/issues/7276
                    //
                    // seems to be ok as of eslint 9.37.0
                    result = (result as Promise<T>).finally(onfinally);
                } else {
                    result = result.then(
                        value =>
                            MaybePromise.then(
                                () => onfinally?.(),
                                () => value,
                            ),
                        error =>
                            MaybePromise.then(
                                () => onfinally?.(),
                                () => {
                                    throw error;
                                },
                            ),
                    );
                }
            } else {
                // The only return value from onfinally that should affect results is a rejected promise, so if we
                // receive a return value chain such that it either throws or we return the actual result
                const finallyResult = onfinally?.();
                if (MaybePromise.is(finallyResult)) {
                    const actualResult = result as T;
                    result = finallyResult.then(() => actualResult);
                }
            }
        }
        return result;
    },

    [Symbol.toStringTag]: "MaybePromise",
};

/**
 * A recurring promise.
 *
 * A gate is duck-compatible with {@link Promise} and includes resolution methods on its public API.
 *
 * As an extension to normal promise semantics, a gate may be "opened" or "closed".  {@link open} provides multi-
 * resolution so that future awaits return a new value.  {@link close} returns the promise to an unsettled state so that
 * future awaits block.
 *
 * This is useful for basic synchronization of two tightly coupled ongoing tasks.
 */
export class Gate<T = void> implements Promise<T> {
    #promise: Promise<T>;
    #resolve: (value: T) => void;
    #reject: (reason: any) => void;
    #resolvedAs: unknown;
    #isResolved = false;
    #isRejected = false;

    constructor() {
        let resolve: (value: T) => void;
        let reject: (reason: any) => void;

        this.#promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        this.#resolve = resolve!;
        this.#reject = reject!;
    }

    /**
     * Move to resolved state with the specified value.
     */
    open(value: T) {
        if (this.#isResolved) {
            if (this.#resolvedAs === value) {
                return;
            }

            this.#resolvedAs = value;
            this.#promise = Promise.resolve(value);
            return;
        }

        if (this.#isRejected) {
            this.#resolvedAs = value;
            this.#isResolved = true;
            this.#isRejected = false;
            this.#promise = Promise.resolve(value);
            return;
        }

        this.resolve(value);
    }

    /**
     * Move to unresolved state.
     */
    close() {
        if (!this.#isResolved && !this.#isRejected) {
            return;
        }

        this.#isResolved = this.#isRejected = false;
        this.#promise = new Promise((resolve, reject) => {
            this.#resolve = resolve;
            this.#reject = reject;
        });
    }

    /**
     * Perform normal promise resolution.  Ignored if promise is already settled.
     */
    resolve(value: T) {
        if (this.#isResolved || this.#isRejected) {
            return;
        }
        this.#resolvedAs = value;
        this.#isResolved = true;
        this.#resolve(value);
    }

    /**
     * Perform normal promise rejection.  Ignored if promise is already settled.
     */
    reject(cause: any) {
        if (this.#isResolved || this.#isRejected) {
            return;
        }
        this.#isRejected = true;
        this.#reject(cause);
    }

    then<TResult1 = T, TResult2 = never>(
        resolve?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        reject?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
        return this.#promise.then(resolve, reject);
    }

    catch<TResult = never>(reject?: ((reason: any) => TResult | PromiseLike<TResult>) | null) {
        return this.#promise.catch(reject);
    }

    finally(then?: (() => void) | null) {
        return this.#promise.finally(then);
    }

    [Symbol.toStringTag] = Promise.prototype[Symbol.toStringTag];
}

MaybePromise.toString = () => "MaybePromise";
