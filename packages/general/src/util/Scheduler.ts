/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { ImplementationError } from "#MatterError.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { Abort } from "./Abort.js";
import { asError } from "./Error.js";
import { Heap } from "./Heap.js";
import { Lifetime } from "./Lifetime.js";
import { BasicMultiplex } from "./Multiplex.js";
import { MaybePromise } from "./Promises.js";
import { Semaphore } from "./Semaphore.js";

const logger = Logger.get("Scheduler");

/**
 * Task scheduler.
 *
 * Runs workers at a designated time.
 */
export class Scheduler<T> {
    #name: string;
    #lifetime: Lifetime;
    #timeOf: Scheduler.Configuration<T>["timeOf"];
    #run: Scheduler.Configuration<T>["run"];
    #queue: Heap<T>;
    #abort = new Abort();
    #workers = new BasicMultiplex();
    #semaphore?: Semaphore;

    constructor({
        name = "scheduler",
        lifetime = Lifetime.process,
        timeOf,
        run,
        semaphore,
    }: Scheduler.Configuration<T>) {
        this.#name = name;
        this.#lifetime = lifetime.join(this.#name);
        this.#timeOf = timeOf;
        this.#run = run;
        this.#semaphore = semaphore;

        this.#queue = new Heap(comparatorFor(timeOf));
        this.#workers.add(this.#schedule());
    }

    /**
     * Schedule a worker.
     */
    add(worker: T) {
        if (this.#lifetime.isClosing) {
            throw new ImplementationError(`Cannot schedule new work because ${this.#name} is closed`);
        }
        this.#queue.add(worker);
    }

    /**
     * Unschedule a worker.
     */
    delete(worker: T) {
        this.#queue.delete(worker);
    }

    /**
     * Update a worker's scheduled run time.
     */
    reschedule(worker: T) {
        this.#queue.delete(worker);
        this.#queue.add(worker);
    }

    /**
     * Close.
     *
     * Stops accepting workers.  Returns when all workers are complete.
     */
    async close() {
        using _closing = this.#lifetime.closing();
        this.#abort();
        await this.#workers;
    }

    /**
     * Performs actual scheduling of workers.
     */
    async #schedule() {
        while (!this.#abort.aborted) {
            // Activate workers that have no more delay
            const now = Time.nowMs;
            let first = this.#queue.first;
            let nextAt = first ? this.#timeOf(first) : undefined;
            while (nextAt !== undefined && nextAt <= now) {
                if (this.#abort.aborted) {
                    return;
                }

                let slot: undefined | Disposable;
                if (this.#semaphore) {
                    slot = await this.#semaphore.obtainSlot(this.#abort);
                    if (this.#abort.aborted) {
                        return;
                    }
                }

                try {
                    this.#queue.shift();
                    const promise = this.#run(first!, this.#abort.signal);
                    if (promise) {
                        let p = Promise.resolve(promise).catch(this.#unhandled.bind(this));
                        if (slot) {
                            p = p.finally(() => slot[Symbol.dispose]());
                        }
                        this.#workers.add(p);
                    } else {
                        slot?.[Symbol.dispose]();
                    }
                } catch (e) {
                    slot?.[Symbol.dispose]();
                    this.#unhandled(e);
                }

                first = this.#queue.first;
                nextAt = first ? this.#timeOf(first) : undefined;
            }

            // Wait for delay for next worker, abort or change in head of queue
            using abort = new Abort({
                abort: this.#abort,
                timeout: nextAt === undefined ? undefined : Timestamp.delta(now, nextAt),
            });
            using _abortOnChange = this.#queue.firstChanged.use(newFirst => abort.if(newFirst !== first));
            await abort;
        }
    }

    #unhandled(e: unknown) {
        logger.error(`Unhandled error in ${this.#name} worker:`, asError(e));
    }
}

export namespace Scheduler {
    export interface Configuration<T> {
        /**
         * Name used for diagnostics.
         *
         * Defaults to "scheduler".
         */
        name?: string;

        /**
         * Owner lifetime.
         *
         * Defaults to process.
         */
        lifetime?: Lifetime.Owner;

        /**
         * Identify the scheduled time for a specific worker.
         */
        timeOf(worker: T): Timestamp;

        /**
         * Execute a worker.
         */
        run(worker: T, abort: AbortSignal): MaybePromise<void>;

        /**
         * If present, controls worker concurrency.
         *
         * Providing the semaphore here rather than using it within the worker prevents the worker from starting when no
         * queue slot is available.
         */
        semaphore?: Semaphore;
    }
}

function comparatorFor<T>(timeOf: Scheduler.Configuration<T>["timeOf"]) {
    return (a: T, b: T) => timeOf(a) - timeOf(b);
}
