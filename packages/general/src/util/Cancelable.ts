/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger } from "#log/Logger.js";
import { CanceledError } from "#MatterError.js";
import { asError, errorOf } from "./Error.js";
import { MaybePromise } from "./Promises.js";

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
