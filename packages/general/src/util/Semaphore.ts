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

const logger = Logger.get("PromiseQueue");

/**
 * A work slot that must be released when work is complete.
 */
export interface WorkSlot extends Disposable {
    /**
     * Release the slot manually.
     * This is called automatically when using `using` syntax.
     */
    release(): void;

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
        reject: (reason?: any) => void;
        abortListener?: () => void;
        signal?: AbortSignal;
    }>();
    #delays = new Set<Timer>();
    readonly #concurrency: number;
    #runningCount = 0;
    #delayCount = 0;
    #closed = false;

    constructor(concurrency = 1, delay = Instant) {
        this.#concurrency = concurrency;
        this.#delay = delay;
    }

    /**
     * Get a work slot from the queue.
     *
     * This method returns a promise that resolves when a slot is available.
     * The returned slot must be released when work is complete, either by
     * calling `release()` or by using the `using` syntax.
     *
     * @param abort - Optional abort signal to cancel waiting for a slot
     * @returns A disposable work slot
     * @throws AbortedError if the abort signal is triggered before a slot is obtained
     */
    async obtainSlot(abort?: Abort.Signal): Promise<WorkSlot> {
        if (this.#closed) {
            throw new AbortedError("Queue is closed");
        }

        // Normalize signal
        const signal = abort ? ("signal" in abort ? abort.signal : abort) : undefined;

        // Check if already aborted
        if (signal?.aborted) {
            throw signal.reason ?? new AbortedError();
        }

        // If we have capacity, grant a slot immediately
        if (this.#runningCount + this.#delayCount < this.#concurrency) {
            return this.#grantSlot();
        }

        // Otherwise, queue up and wait
        const { promise, resolver, rejecter } = createPromise<WorkSlot>();

        const entry = {
            resolve: resolver,
            reject: rejecter,
            signal,
            abortListener: undefined as (() => void) | undefined,
        };

        // Set up abort listener if signal provided
        if (signal) {
            entry.abortListener = () => {
                // Remove from queue
                const index = this.#queue.indexOf(entry);
                if (index !== -1) {
                    this.#queue.splice(index, 1);
                    logger.debug("Slot request aborted, removed from queue. Remaining:", this.#queue.length);
                }
                rejecter(signal.reason ?? new AbortedError());
            };
            signal.addEventListener("abort", entry.abortListener, { once: true });
        }

        logger.debug("Queueing slot request at position", this.#queue.length + 1);
        this.#queue.push(entry);

        return promise;
    }

    /**
     * Grant a slot immediately (when capacity is available).
     */
    #grantSlot(): WorkSlot {
        this.#runningCount++;

        let released = false;

        return {
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                this.#releaseSlot();
            },

            [Symbol.dispose]() {
                this.release();
            },
        } satisfies WorkSlot;
    }

    /**
     * Release a slot and potentially grant to next in queue.
     */
    #releaseSlot(): void {
        this.#runningCount--;
        if (this.#delay > 0) {
            this.#delayCount++;
        }

        if (this.#delay > 0) {
            // Keep the slot blocked during delay, then release
            const delay = Time.getTimer("Queue delay", this.#delay, () => {
                this.#delays.delete(delay);
                if (this.#delayCount > 0) {
                    this.#delayCount--;
                }
                this.#processNextInQueue();
            }).start();
            this.#delays.add(delay);
        } else {
            this.#processNextInQueue();
        }
    }

    /**
     * Process the next waiting request in the queue.
     */
    #processNextInQueue(): void {
        if (this.#queue.length === 0) {
            return;
        }

        const next = this.#queue.shift()!;

        // Clean up abort listener if present
        if (next.abortListener && next.signal) {
            next.signal.removeEventListener("abort", next.abortListener);
        }

        // Grant the slot to the next waiter
        const slot = this.#grantSlot();
        next.resolve(slot);
    }

    /**
     * Clear the queue.
     *
     * @param reject - If true, reject all pending slot requests with an AbortedError
     */
    clear(reject: boolean): void {
        if (reject) {
            for (const entry of this.#queue) {
                // Clean up abort listener
                if (entry.abortListener && entry.signal) {
                    entry.signal.removeEventListener("abort", entry.abortListener);
                }
                entry.reject(new AbortedError("Queue cleared"));
            }
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
        this.clear(true);
        for (const delay of this.#delays) {
            delay.stop();
        }
    }
}
