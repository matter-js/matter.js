/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "../log/Logger.js";
import { asError } from "./Error.js";

const logger = Logger.get("Mutex");

/**
 * A mutex is a task queue where at most one task is active at a time.
 */
export class Mutex implements PromiseLike<unknown> {
    #owner: {};
    #cancel?: () => void;
    #canceled = false;
    #promise?: Promise<unknown>;

    constructor(owner: {}, initial?: PromiseLike<unknown>) {
        this.#owner = owner;
        if (initial) {
            this.run(() => initial);
        }
    }

    /**
     * As a PromiseLike, you can await the Mutex.  This promise resolves when current activity completes but the mutex
     * may engage in another activity immediately thereafter.  So the mutex is not guaranteed to be available after an
     * await.
     */
    then<TResult1 = void, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        return (this.#promise || Promise.resolve()).then(onfulfilled, onrejected);
    }

    /**
     * Enqueue additional work.
     *
     * If {@link task} is a function it runs when current activity completes.  If it is a promise then the mutex will
     * not clear until {@link task} resolves.
     */
    run(task: PromiseLike<unknown> | (() => PromiseLike<unknown>), cancel?: () => void) {
        if (this.#canceled) {
            cancel?.();
            return;
        }

        if (!this.#promise) {
            this.#promise = this.initiateTask(task);
        } else {
            this.#promise = this.#promise.then(() => {
                if (this.#canceled) {
                    cancel?.();
                    return;
                }

                this.#cancel = cancel;
                return this.initiateTask(task).finally(() => {
                    this.#cancel = undefined;
                });
            });
        }
    }

    /**
     * Enqueue work with an awaitable result.
     */
    produce<T>(task: () => PromiseLike<T>, cancel?: () => void): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.run(async () => {
                try {
                    resolve(await task());
                } catch (e) {
                    reject(asError(e));
                }
            }, cancel);
        });
    }

    /**
     * Acquire the lock.
     *
     * This offers more natural mutex handling via a disposable.  The returned object must be disposed to unlock the
     * mutex.
     *
     * Note that acquiring the lock is async but releasing is not, so you must use `using _lock = await mutex.lock()`
     * rather than `await using _lock = mutex.lock()`.
     *
     * TODO - add abort support
     */
    async lock(): Promise<Disposable> {
        return new Promise(lockObtained => {
            this.run(async () => {
                await new Promise<void>(lockReleased => {
                    lockObtained({
                        [Symbol.dispose]: lockReleased,
                    });
                });
            });
        });
    }

    /**
     * Cancel remaining work and perform one last task with the Mutex held.
     */
    terminate(cleanup?: () => PromiseLike<void>) {
        if (this.#canceled) {
            return;
        }

        this.#canceled = true;

        if (this.#cancel) {
            this.#cancel();
        }

        if (cleanup) {
            if (!this.#promise) {
                this.#promise = this.initiateTask(cleanup);
            } else {
                this.#promise = this.#promise.then(() => this.initiateTask(cleanup));
            }
        }
    }

    /**
     * Activate a task.
     */
    protected async initiateTask(task: PromiseLike<unknown> | (() => PromiseLike<unknown>)) {
        if (typeof task === "function") {
            task = task();
        }
        return Promise.resolve(task).catch(cause => logger.error(`Unhandled error in ${this.#owner} worker:`, cause));
    }
}
