/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbortedError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";
import { Instant } from "#time/TimeUnit.js";
import { Logger } from "../log/Logger.js";
import { Abort } from "./Abort.js";
import { createPromise } from "./Promises.js";

const logger = Logger.get("Semaphore");

/**
 * A work slot that must be released when work is complete.
 */
export interface WorkSlot extends Disposable {
    /**
     * Release the slot manually.
     * This is called automatically when using `using` syntax.
     */
    close(): void;

    /**
     * Release the slot automatically when the object is garbage collected.
     */
    [Symbol.dispose](): void;
}

/**
 * A queue that limits concurrent work using a slot-based approach.
 *
 * Instead of queueing promises or iterators directly, callers get a "work slot"
 * which they hold while doing work. The slot must be released when work is complete.
 */
export class Semaphore {
    readonly #delay: Duration;
    readonly #queue = new Array<{
        resolve: (slot: WorkSlot) => void;
    }>();
    #delayTimer: Timer;
    readonly #concurrency: number;
    #runningCount = 0;
    #abort = new Abort();
    #closed = false;

    constructor(concurrency = 1, delay = Instant) {
        this.#concurrency = concurrency;
        this.#delay = delay;
        this.#delayTimer = Time.getTimer("Queue delay", this.#delay, () => this.#processNextInQueue());
    }

    /**
     * Get a work slot from the queue.
     *
     * This method returns a promise that resolves when a slot is available.
     * The returned slot must be released when work is complete, either by
     * calling `close()` or by using the `using` syntax.
     *
     * @param abort - Optional abort signal to cancel waiting for a slot
     * @returns A disposable work slot
     * @throws AbortedError if the abort signal is triggered before a slot is obtained
     */
    async obtainSlot(abort?: Abort.Signal): Promise<WorkSlot> {
        // Check if closed or already aborted before proceeding
        if (this.#closed) {
            throw new AbortedError("Queue is closed");
        }
        if (abort) {
            const signal = "signal" in abort ? abort.signal : abort;
            signal.throwIfAborted();
        }

        // Combine caller's abort with our internal abort for unified cancellation
        using combinedAbort = new Abort({ abort: abort ? [abort, this.#abort] : [this.#abort] });

        // Check if we can grant it immediately:
        // - Must have capacity
        // - No one else waiting in the queue
        // - Either no delay configured, or delay timer not running (a cooldown period passed)
        const canGrantImmediately =
            this.#runningCount < this.#concurrency &&
            this.#queue.length === 0 &&
            (this.#delay === 0 || !this.#delayTimer.isRunning);

        if (canGrantImmediately) {
            return this.#grantSlot();
        }

        // Need to queue - either no capacity or delay hasn't passed yet
        const { promise, resolver } = createPromise<WorkSlot>();

        const entry = { resolve: resolver };

        logger.debug("Queueing slot request at position", this.#queue.length + 1);
        this.#queue.push(entry);

        // Ensure the timer is running to process queue (handles both capacity-wait and delay-wait)
        this.#scheduleProcessing();

        // Race the promise against abort - if aborted, remove from the queue and throw
        const result = await combinedAbort.race(promise);
        if (result === undefined) {
            // Aborted - remove from queue if still present
            const index = this.#queue.indexOf(entry);
            if (index !== -1) {
                this.#queue.splice(index, 1);
                logger.debug("Slot request aborted, removed from queue. Remaining:", this.#queue.length);
            }
            // Throw AbortedError (use reason if it's already an AbortedError)
            const reason = combinedAbort.reason;
            throw reason instanceof AbortedError ? reason : new AbortedError();
        }

        return result;
    }

    /**
     * Schedule processing of the queue if there's capacity and items waiting.
     */
    #scheduleProcessing(): void {
        if (this.#delayTimer.isRunning) return;
        if (this.#queue.length === 0) return;
        if (this.#runningCount >= this.#concurrency) return;

        const delayMs = this.#delay;
        if (delayMs === 0) {
            // No delay configured, process immediately
            this.#processNextInQueue();
        } else {
            // Start the delay timer
            this.#delayTimer.start();
        }
    }

    /**
     * Grant a slot immediately (when capacity is available).
     */
    #grantSlot(): WorkSlot {
        this.#runningCount++;

        // Start a delay timer to enforce cooldown before the next grant
        if (this.#delay > 0) {
            this.#delayTimer.start();
        }

        let released = false;

        return {
            close: () => {
                if (released) {
                    return;
                }
                released = true;
                this.#releaseSlot();
            },

            [Symbol.dispose]() {
                this.close();
            },
        } satisfies WorkSlot;
    }

    /**
     * Release a slot and potentially grant to next in queue.
     */
    #releaseSlot(): void {
        this.#runningCount--;
        this.#scheduleProcessing();
    }

    /**
     * Process the next waiting request in the queue.
     */
    #processNextInQueue(): void {
        if (this.#queue.length === 0) {
            return;
        }
        if (this.#runningCount >= this.#concurrency) {
            return;
        }

        const next = this.#queue.shift()!;

        // Grant the slot to the next waiter
        const slot = this.#grantSlot();
        next.resolve(slot);

        // Schedule next processing if more items in queue
        this.#scheduleProcessing();
    }

    /**
     * Clear the queue (entries will be rejected via abort).
     */
    clear(): void {
        if (this.#queue.length > 0) {
            // Abort current waiters and create fresh abort for future requests
            this.#abort.abort(new AbortedError("Queue cleared"));
            this.#abort = new Abort();
        }
        this.#queue.length = 0;
    }

    /**
     * Get the number of pending slot requests in the queue.
     */
    get count() {
        return this.#queue.length;
    }

    /**
     * Get the number of currently active slots.
     */
    get running() {
        return this.#runningCount;
    }

    /**
     * Close the queue and reject all pending slot requests.
     */
    close(): void {
        this.#closed = true;
        this.#abort.abort(new AbortedError("Queue is closed"));
        this.clear();
        this.#delayTimer.stop();
    }
}
