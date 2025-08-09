/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger } from "#log/Logger.js";
import { CanceledError } from "#MatterError.js";
import { asError, errorOf } from "./Error.js";
import { createPromise, MaybePromise } from "./Promises.js";

/**
 * An operation that may be canceled.
 */
export interface Cancelable {
    /**
     * Cancel the operation.
     */
    cancel(reason: any): void;
}

/**
 * A {@link PromiseLike} that may be canceled.
 *
 * Behaves like a normal promise but does not actually extend {@link Promise} because that's a huge PITA.
 */
export class CancelablePromise<T = void> implements Promise<T>, Cancelable {
    #reject!: (cause: any) => void;
    #promise: Promise<T>;
    #isSettled = false;

    // Cancelable cannot create its own logger because that would create a circular dependency
    static #logger: Logger | Console = console;

    /**
     * Create a new cancelable promise.
     *
     * If the promise is rejected due to cancelation, the {@link executor} callbacks have no effect.
     *
     * If you supply {@link onCancel} it overwrites the {@link CancelablePromise#onCancel} method.
     *
     * @param executor the normal executor supplied to a {@link Promise} constructor
     * @param onCancel rejection handler supplied with a reason and a callback for optionally rejecting the promise
     */
    constructor(
        executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
        onCancel?: (reason: Error) => void,
    ) {
        if (onCancel !== undefined) {
            this.onCancel = onCancel;
        }

        this.#promise = new Promise((resolve, reject) => {
            this.#reject = (reason?: any) => {
                this.#isSettled = true;
                reject(errorOf(reason));
            };

            executor(
                (value: T | PromiseLike<T>) => {
                    if (this.#isSettled) {
                        return;
                    }

                    this.#isSettled = true;
                    resolve(value);
                },

                (reason?: any) => {
                    if (this.#isSettled) {
                        CancelablePromise.logger.warn(`Cancelable promise rejected after settle:`, reason);
                        return;
                    }

                    this.#reject(reason);
                },
            );
        });
    }

    /**
     * Cancel the operation.
     */
    cancel(reason: unknown = new CanceledError()) {
        if (this.#isSettled) {
            return;
        }

        try {
            this.onCancel(asError(reason));
        } catch (e) {
            this.#reject(e);
        }
    }

    /**
     * Implement cancelation.  This is only invoked if the promise has not resolved.
     *
     * Throwing causes the promise to reject with the error thrown.  The default implementation rethrows {@link reason}.
     *
     * This is overwritten if there is an "onCancel" argument to the constructor.
     */
    protected onCancel(reason: Error) {
        throw reason;
    }

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): CancelablePromise<TResult1 | TResult2> {
        const result = this.#promise.then(onfulfilled, onrejected) as CancelablePromise<TResult1 | TResult2>;
        result.cancel = this.cancel.bind(this);
        return result;
    }

    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
    ): CancelablePromise<T | TResult> {
        return this.then(undefined, onrejected);
    }

    finally(onfinally?: (() => void) | null): CancelablePromise<T> {
        const handler = (result: any) => {
            onfinally?.();
            return result;
        };
        return this.then(handler, handler);
    }

    get [Symbol.toStringTag]() {
        return this.#promise[Symbol.toStringTag];
    }

    static is<T>(value: MaybePromise<T>): value is CancelablePromise<T> {
        return MaybePromise.is(value) && typeof (value as CancelablePromise<T>).cancel === "function";
    }

    static resolve<T>(value: T): CancelablePromise<T> {
        const result = Promise.resolve(value) as CancelablePromise<T>;
        result.cancel = () => {};
        return result;
    }

    static reject(cause: any): CancelablePromise<any> {
        const result = Promise.reject(errorOf(cause)) as CancelablePromise<any>;
        result.cancel = () => {};
        return result;
    }

    static set logger(logger: Logger | Console) {
        this.#logger = logger;
    }

    static get logger() {
        return this.#logger;
    }
}

/**
 * An {@link AsyncIterator} that may be canceled.
 */
export class CancelableAsyncIterator<T, TReturn = T, TNext = void>
    implements AsyncIterator<T, TReturn, TNext>, Cancelable
{
    // The result of the final iteration
    #settled?: boolean;

    // The input next implementation
    #next: (...[value]: [] | [TNext]) => Promise<IteratorResult<T, TReturn>>;

    // We race against this promise to detect cancelation during next()
    #canceled: Promise<IteratorResult<T, TReturn>>;

    // Rejects #canceled
    #reject!: (reason: any) => void;

    /**
     * Create a new instance.
     *
     * @param next the function that produces results
     * @param onCancel if provided this will overwrite {@link onCancel}
     */
    constructor(
        next: (...[value]: [] | [TNext]) => Promise<IteratorResult<T, TReturn>>,
        onCancel?: (reason: Error) => void,
    ) {
        this.#next = next;
        this.#canceled = new Promise((_resolve, reject) => (this.#reject = reject));
        if (onCancel !== undefined) {
            this.onCancel = onCancel;
        }
    }

    next(...[value]: [] | [TNext]): Promise<IteratorResult<T, TReturn>> {
        if (this.#settled) {
            // This type is a lie if TReturn does not allow undefined but TS doesn't give us any options here, and
            // calling next after the final iteration doesn't make semantic sense anyway.  The spec does say subsequent
            // calls should return done = true
            return Promise.resolve({ done: true } as IteratorResult<T, TReturn>);
        }

        const next = value === undefined ? this.#next() : this.#next(value);

        // If next resolves after we've canceled we ignore it, but if we were to do that with an error it would be
        // unhandled.  Errors from next will still cause an unhandled error if not caught before we set this.#final
        // because we rethrow from the race below where this.#final cannot be set
        next.catch(reason => {
            if (this.#settled) {
                CancelablePromise.logger.warn(`Cancelable async iterator rejected after return:`, reason);
            }
        });

        return Promise.race([next, this.#canceled]).then(
            result => {
                // next resolved (this.#canceled can only be rejected)
                if (result.done) {
                    this.#settled = true;
                }
                return result;
            },
            reason => {
                // next or this.#canceled rejected; regardless we use this for all subsequent calls to next() since we
                // will never receive TReturn
                this.#settled = true;
                throw reason;
            },
        );
    }

    cancel(reason: any): void {
        if (this.#settled) {
            return;
        }

        try {
            this.onCancel(reason);
        } catch (e) {
            this.#reject(e);
        }
    }

    /**
     * Handle cancelation.
     *
     * If the underlying operation supports cancelation then it is better to use that.  Otherwise throwing
     * {@link reason} (the default behavior) will reject the current (or next) iteration regardless of the state of the
     * underyling operation.
     *
     * @param reason the reason provided to {@link cancel}
     */
    protected onCancel(reason: any) {
        throw reason;
    }

    static is(value: unknown): value is CancelableAsyncIterator<unknown> {
        return (
            typeof value === "object" &&
            value !== null &&
            Symbol.asyncIterator in value &&
            typeof value[Symbol.asyncIterator] === "function" &&
            "cancel" in value &&
            typeof value["cancel"] === "function"
        );
    }
}

/**
 * Create a function that returns a {@link CancelablePromise} and delegates cancelation internally to other async logic.
 *
 * The output function invokes the supplied {@link executor} with an additional "cancelable" argument.  This function
 * wraps supported types (currently {@link CancelablePromise}, {@link CancelableAsyncIterator} and {@link Promise}) with
 * cancelation logic.
 *
 * Any such wrapped object behaves normally but will throw with the cancelation reason on cancel.
 */
export function Cancelable<ThisT, ArgsT extends unknown[], ReturnT>(
    executor: Cancelable.Executor<ThisT, ArgsT, ReturnT>,
) {
    // The proxy that invokes the executor with a "canceable" argument used for delegation
    return function cancelable(this: ThisT, ...args: ArgsT): CancelablePromise<ReturnT> {
        // Active delegates register here
        let delegates: undefined | Set<(reason: any) => void>;

        // The return value from the proxy function
        return new CancelablePromise<ReturnT>(
            (resolve, reject) => {
                // Invoke the executor
                try {
                    const result = executor.call(this, cancelable, ...args);

                    if (MaybePromise.is(result)) {
                        result.then(resolve, reject);
                        return;
                    }

                    resolve(result);
                } catch (e) {
                    reject(e);
                }

                // We pass this function to the executor; the executor invokes on supported objects to perform
                // delegation
                function cancelable<T>(value: T): T {
                    // Delegation to cancelable promise - just cancel when we are canceled; unregister when the target
                    // resolves
                    if (CancelablePromise.is(value)) {
                        const undelegate = addDelegate(reason => value.cancel(reason));
                        return value.finally(undelegate) as T;
                    }

                    // Delegation to cancelable async iterators - cancel when we cancel; unregister when iteration
                    // completes
                    if (CancelableAsyncIterator.is(value)) {
                        const undelegate = addDelegate(reason => value.cancel(reason));
                        const next = value.next.bind(value);
                        value.next = () => {
                            return next().then(
                                result => {
                                    if (result.done) {
                                        undelegate();
                                    }
                                    return result;
                                },
                                reason => {
                                    undelegate();
                                    throw reason;
                                },
                            );
                        };

                        return value;
                    }

                    // Delegation to non-cancelable promises - use a race to abort the wait but operation will proceed
                    if (MaybePromise.is(value)) {
                        const { promise, rejecter } = createPromise<T>();
                        const undelegate = addDelegate(reason => rejecter(reason));
                        return Promise.race([promise, value]).finally(() => undelegate) as T;
                    }

                    // No delegation possible; just return the original value
                    return value;
                }
            },

            // Our "onCancel" that delegates to any registered delegators or simply rethrows if no delegation is active
            reason => {
                if (!delegates?.size) {
                    throw reason;
                }

                for (const delegate of delegates) {
                    delegate(reason);
                }
            },
        );

        // Register a delegate
        function addDelegate(delegate: (reason: any) => void) {
            if (!delegates) {
                delegates = new Set();
            }
            delegates.add(delegate);

            return () => {
                delegates?.delete(delegate);
            };
        }
    };
}

export namespace Cancelable {
    export interface Delegator {
        <T>(value: T): T;
    }

    export interface Executor<ThisT, ArgsT extends unknown[], ReturnT> {
        (this: ThisT, cancelable: Delegator, ...args: ArgsT): MaybePromise<ReturnT>;
    }
}
