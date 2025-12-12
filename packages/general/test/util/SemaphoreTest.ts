/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbortedError } from "#MatterError.js";
import { Abort } from "#util/Abort.js";
import { Semaphore } from "#util/Semaphore.js";

describe("Semaphore", () => {
    describe("slot acquisition", () => {
        it("grants slot immediately when capacity available", async () => {
            const queue = new Semaphore(1);

            const slot = await queue.obtainSlot();

            expect(queue.running).equals(1);
            expect(queue.count).equals(0);

            slot.release();
        });

        it("queues when at capacity", async () => {
            const queue = new Semaphore(1);

            const slot1 = await queue.obtainSlot();
            expect(queue.running).equals(1);

            // This should queue
            let slot2Obtained = false;
            const slot2Promise = queue.obtainSlot().then(slot => {
                slot2Obtained = true;
                return slot;
            });

            // Give microtask a chance to run
            await MockTime.yield();

            expect(slot2Obtained).equals(false);
            expect(queue.count).equals(1);

            // Release first slot
            slot1.release();

            // Now slot2 should be granted
            const slot2 = await slot2Promise;
            expect(slot2Obtained).equals(true);
            expect(queue.running).equals(1);
            expect(queue.count).equals(0);

            slot2.release();
        });

        it("releases slot via dispose", async () => {
            const queue = new Semaphore(1);

            {
                using _slot = await queue.obtainSlot();
                expect(queue.running).equals(1);
            }

            // After scope exit, slot should be released
            expect(queue.running).equals(0);
        });

        it("release is idempotent", async () => {
            const queue = new Semaphore(1);

            const slot = await queue.obtainSlot();
            expect(queue.running).equals(1);

            slot.release();
            expect(queue.running).equals(0);

            // Second release should be no-op
            slot.release();
            expect(queue.running).equals(0);
        });
    });

    describe("concurrency", () => {
        it("respects concurrency limit of 1", async () => {
            const queue = new Semaphore(1);
            const executionOrder: string[] = [];

            const task1 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task1-start");
                await MockTime.advance(10);
                executionOrder.push("task1-end");
            })();

            const task2 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task2-start");
                executionOrder.push("task2-end");
            })();

            await Promise.all([task1, task2]);

            expect(executionOrder).deep.equals(["task1-start", "task1-end", "task2-start", "task2-end"]);
        });

        it("allows parallel execution with concurrency 2", async () => {
            const queue = new Semaphore(2);
            const executionOrder: string[] = [];

            const task1 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task1-start");
                await MockTime.advance(20);
                executionOrder.push("task1-end");
            })();

            const task2 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task2-start");
                await MockTime.advance(10);
                executionOrder.push("task2-end");
            })();

            await Promise.all([task1, task2]);

            // Both should start before either ends
            expect(executionOrder.slice(0, 2)).to.have.members(["task1-start", "task2-start"]);
        });

        it("respects concurrency limit of 3", async () => {
            const queue = new Semaphore(3);
            let runningCount = 0;
            let maxRunning = 0;

            const createTask = () =>
                (async () => {
                    using _slot = await queue.obtainSlot();
                    runningCount++;
                    maxRunning = Math.max(maxRunning, runningCount);
                    await MockTime.advance(10);
                    runningCount--;
                })();

            await Promise.all([createTask(), createTask(), createTask(), createTask(), createTask()]);

            expect(maxRunning).equals(3);
        });

        it("with concurrency 3, tasks 1-3 start before task 4", async () => {
            const queue = new Semaphore(3);
            const startOrder: number[] = [];
            const endOrder: number[] = [];

            const createTask = (id: number, delay: number) =>
                (async () => {
                    using _slot = await queue.obtainSlot();
                    startOrder.push(id);
                    await MockTime.advance(delay);
                    endOrder.push(id);
                })();

            // Task 4 has shortest delay but should still wait for a slot
            const t1 = createTask(1, 30);
            const t2 = createTask(2, 20);
            const t3 = createTask(3, 10);
            const t4 = createTask(4, 5);

            await Promise.all([t1, t2, t3, t4]);

            // Tasks 1, 2, 3 should all start before task 4
            expect(startOrder.slice(0, 3)).to.have.members([1, 2, 3]);
            expect(startOrder[3]).equals(4);

            // Task 3 ends first (10ms), freeing slot for task 4
            expect(endOrder[0]).equals(3);
        });

        it("with concurrency 2, task order is respected as slots free up", async () => {
            const queue = new Semaphore(2);
            const events: string[] = [];

            const createTask = (id: number, delay: number) =>
                (async () => {
                    using _slot = await queue.obtainSlot();
                    events.push(`start-${id}`);
                    await MockTime.advance(delay);
                    events.push(`end-${id}`);
                })();

            const t1 = createTask(1, 40); // Slot 1: runs 0-40ms
            const t2 = createTask(2, 20); // Slot 2: runs 0-20ms
            const t3 = createTask(3, 15); // Waits, then slot 2: runs 20-35ms
            const t4 = createTask(4, 10); // Waits, then slot 2: runs 35-45ms

            await Promise.all([t1, t2, t3, t4]);

            // Tasks 1 and 2 start immediately (concurrency 2)
            expect(events.slice(0, 2)).to.have.members(["start-1", "start-2"]);

            // Task 2 ends first (20ms), freeing slot for task 3
            expect(events.indexOf("end-2")).to.be.lessThan(events.indexOf("start-3"));

            // Task 3 starts before task 4
            expect(events.indexOf("start-3")).to.be.lessThan(events.indexOf("start-4"));

            // Task 3 ends before task 4 starts (both use same slot sequentially)
            expect(events.indexOf("end-3")).to.be.lessThan(events.indexOf("start-4"));
        });

        it("queued tasks execute in FIFO order", async () => {
            const queue = new Semaphore(1);
            const executionOrder: number[] = [];
            let resolveBlocker!: () => void;
            const blockerReady = new Promise<void>(r => {
                // First task blocks the queue
                void (async () => {
                    using _slot = await queue.obtainSlot();
                    await new Promise<void>(resolve => {
                        resolveBlocker = resolve;
                        r(); // Signal that blocker is ready
                    });
                    executionOrder.push(1);
                })();
            });

            // Wait for the first task to acquire slot and set up blocker
            await blockerReady;

            // Queue up more tasks while blocked
            const t2 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push(2);
            })();
            const t3 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push(3);
            })();
            const t4 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push(4);
            })();

            // Wait for tasks to queue up
            await MockTime.advance(10);

            // Release the blocker
            resolveBlocker();

            await Promise.all([t2, t3, t4]);

            // Tasks should execute in order they were added
            expect(executionOrder).deep.equals([1, 2, 3, 4]);
        });
    });

    describe("abort handling", () => {
        it("throws if abort signal is already aborted", async () => {
            const queue = new Semaphore(1);
            const abortController = new AbortController();
            abortController.abort(new AbortedError("pre-aborted"));

            let error: Error | undefined;
            try {
                await queue.obtainSlot(abortController.signal);
            } catch (e) {
                error = e as Error;
            }

            expect(error).to.be.instanceOf(AbortedError);
        });

        it("rejects queued request when abort signal fires", async () => {
            const queue = new Semaphore(1);

            // Take the only slot
            const slot1 = await queue.obtainSlot();

            // Queue a second request with abort
            const abortController = new AbortController();
            const slot2Promise = queue.obtainSlot(abortController.signal);

            expect(queue.count).equals(1);

            // Abort while waiting
            abortController.abort(new AbortedError("cancelled"));

            let error: Error | undefined;
            try {
                await slot2Promise;
            } catch (e) {
                error = e as Error;
            }

            expect(error).to.be.instanceOf(AbortedError);
            expect(queue.count).equals(0); // Should be removed from queue

            slot1.release();
        });

        it("abort does not affect requests without abort signal", async () => {
            const queue = new Semaphore(1);

            // Take the only slot
            const slot1 = await queue.obtainSlot();

            // Queue requests - one with abort, one without
            const abortController = new AbortController();
            const slot2Promise = queue.obtainSlot(abortController.signal);
            const slot3Promise = queue.obtainSlot();

            expect(queue.count).equals(2);

            // Abort the second request
            abortController.abort();

            // Wait for abort to process
            let slot2Rejected = false;
            try {
                await slot2Promise;
            } catch {
                slot2Rejected = true;
            }

            expect(slot2Rejected).equals(true);
            expect(queue.count).equals(1); // slot3 still waiting

            // Release first slot - slot3 should get it
            slot1.release();

            const slot3 = await slot3Promise;
            expect(queue.running).equals(1);

            slot3.release();
        });

        it("works with Abort utility class", async () => {
            const queue = new Semaphore(1);

            // Take the only slot
            const slot1 = await queue.obtainSlot();

            // Queue with Abort class
            const abort = new Abort();
            const slot2Promise = queue.obtainSlot(abort);

            expect(queue.count).equals(1);

            // Abort
            abort.abort();

            let error: Error | undefined;
            try {
                await slot2Promise;
            } catch (e) {
                error = e as Error;
            }

            expect(error).to.be.instanceOf(AbortedError);

            slot1.release();
            abort.close();
        });
    });

    describe("queue management", () => {
        it("reports correct count", async () => {
            const queue = new Semaphore(1);

            expect(queue.count).equals(0);
            expect(queue.running).equals(0);

            const slot1 = await queue.obtainSlot();
            expect(queue.count).equals(0);
            expect(queue.running).equals(1);

            const slot2Promise = queue.obtainSlot();
            expect(queue.count).equals(1);

            const slot3Promise = queue.obtainSlot();
            expect(queue.count).equals(2);

            slot1.release();
            const slot2 = await slot2Promise;
            expect(queue.count).equals(1);

            slot2.release();
            const slot3 = await slot3Promise;
            expect(queue.count).equals(0);

            slot3.release();
        });

        it("clear(false) removes pending requests without rejecting", async () => {
            const queue = new Semaphore(1);

            const slot1 = await queue.obtainSlot();
            await queue.obtainSlot(); // This will be orphaned
            await queue.obtainSlot(); // This will be orphaned

            expect(queue.count).equals(2);

            queue.clear(false);

            expect(queue.count).equals(0);
            slot1.release();
        });

        it("clear(true) rejects all pending requests", async () => {
            const queue = new Semaphore(1);

            const slot1 = await queue.obtainSlot();
            const slot2Promise = queue.obtainSlot();
            const slot3Promise = queue.obtainSlot();

            expect(queue.count).equals(2);

            queue.clear(true);

            expect(queue.count).equals(0);

            let error2: Error | undefined;
            try {
                await slot2Promise;
            } catch (e) {
                error2 = e as Error;
            }

            let error3: Error | undefined;
            try {
                await slot3Promise;
            } catch (e) {
                error3 = e as Error;
            }

            expect(error2).to.be.instanceOf(AbortedError);
            expect(error3).to.be.instanceOf(AbortedError);

            slot1.release();
        });

        it("close() marks queue as closed and rejects pending", async () => {
            const queue = new Semaphore(1);

            const slot1 = await queue.obtainSlot();
            const slot2Promise = queue.obtainSlot();

            queue.close();

            // Pending request should be rejected
            let error: Error | undefined;
            try {
                await slot2Promise;
            } catch (e) {
                error = e as Error;
            }
            expect(error).to.be.instanceOf(AbortedError);

            // New requests should fail
            let newError: Error | undefined;
            try {
                await queue.obtainSlot();
            } catch (e) {
                newError = e as Error;
            }
            expect(newError).to.be.instanceOf(AbortedError);

            slot1.release();
        });
    });

    describe("async iterator pattern", () => {
        it("works with async iterators using slot", async () => {
            const queue = new Semaphore(1);

            async function* generator() {
                yield 1;
                yield 2;
                yield 3;
            }

            const results: number[] = [];

            {
                using _slot = await queue.obtainSlot();
                for await (const value of generator()) {
                    results.push(value);
                }
            }

            expect(results).deep.equals([1, 2, 3]);
            expect(queue.running).equals(0);
        });

        it("serializes async iterator processing", async () => {
            const queue = new Semaphore(1);
            const executionOrder: string[] = [];

            async function* gen1() {
                executionOrder.push("gen1-start");
                yield "a";
                await MockTime.advance(10);
                yield "b";
                executionOrder.push("gen1-end");
            }

            async function* gen2() {
                executionOrder.push("gen2-start");
                yield "c";
                executionOrder.push("gen2-end");
            }

            const processIterator = async (gen: AsyncGenerator<string>) => {
                const results: string[] = [];
                using _slot = await queue.obtainSlot();
                for await (const value of gen) {
                    results.push(value);
                }
                return results;
            };

            const [result1, result2] = await Promise.all([processIterator(gen1()), processIterator(gen2())]);

            expect(result1).deep.equals(["a", "b"]);
            expect(result2).deep.equals(["c"]);
            expect(executionOrder).deep.equals(["gen1-start", "gen1-end", "gen2-start", "gen2-end"]);
        });

        it("releases slot on iterator error", async () => {
            const queue = new Semaphore(1);

            async function* failingGenerator() {
                yield 1;
                throw new Error("generator error");
            }

            let error: Error | undefined;
            try {
                using _slot = await queue.obtainSlot();
                for await (const _value of failingGenerator()) {
                    // Process values
                }
            } catch (e) {
                error = e as Error;
            }

            expect(error?.message).equals("generator error");
            expect(queue.running).equals(0); // Slot should be released
        });

        it("can abort while processing async iterator", async () => {
            const queue = new Semaphore(1);

            // Take the slot
            const slot1 = await queue.obtainSlot();

            // Try to get another slot with abort
            const abortController = new AbortController();
            const slot2Promise = queue.obtainSlot(abortController.signal);

            // Abort while waiting
            abortController.abort();

            let rejected = false;
            try {
                await slot2Promise;
            } catch {
                rejected = true;
            }

            expect(rejected).equals(true);

            slot1.release();
        });
    });

    describe("wrapper pattern", () => {
        /**
         * Simulates the wrapper pattern for conditionally queuing work.
         */
        async function withOptionalQueue<T>(
            queue: Semaphore | undefined,
            queued: boolean,
            work: () => Promise<T>,
        ): Promise<T> {
            if (queued && queue) {
                const slot = await queue.obtainSlot();
                try {
                    return await work();
                } finally {
                    slot.release();
                }
            }
            return work();
        }

        /**
         * Wrapper for async iterables.
         */
        async function* iterableWithQueue<T>(
            queue: Semaphore | undefined,
            queued: boolean,
            invoke: () => AsyncIterable<T>,
        ): AsyncIterable<T> {
            if (queued && queue) {
                const slot = await queue.obtainSlot();
                try {
                    for await (const value of invoke()) {
                        yield value;
                    }
                } finally {
                    slot.release();
                }
            } else {
                yield* invoke();
            }
        }

        /** Helper to collect all values from an async iterable */
        async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
            const results: T[] = [];
            for await (const value of iterable) {
                results.push(value);
            }
            return results;
        }

        it("wrapper works when not queued", async () => {
            const result = await withOptionalQueue(undefined, false, async () => "success");
            expect(result).equals("success");
        });

        it("wrapper works when queued", async () => {
            const queue = new Semaphore(1);
            const result = await withOptionalQueue(queue, true, async () => "success");
            expect(result).equals("success");
        });

        it("wrapper respects queue ordering", async () => {
            const queue = new Semaphore(1);
            const executionOrder: string[] = [];

            const task1 = withOptionalQueue(queue, true, async () => {
                executionOrder.push("task1-start");
                await MockTime.advance(10);
                executionOrder.push("task1-end");
                return "t1";
            });

            const task2 = withOptionalQueue(queue, true, async () => {
                executionOrder.push("task2-start");
                executionOrder.push("task2-end");
                return "t2";
            });

            await Promise.all([task1, task2]);

            expect(executionOrder).deep.equals(["task1-start", "task1-end", "task2-start", "task2-end"]);
        });

        it("wrapper bypasses queue when not queued", async () => {
            const queue = new Semaphore(1);
            const executionOrder: string[] = [];

            // Block the queue
            const blocker = withOptionalQueue(queue, true, async () => {
                executionOrder.push("blocker-start");
                await MockTime.advance(50);
                executionOrder.push("blocker-end");
            });

            // Non-queued should bypass the blocked queue
            const result = await withOptionalQueue(queue, false, async () => {
                executionOrder.push("bypass");
                return "bypassed";
            });

            expect(result).equals("bypassed");
            expect(executionOrder.slice(0, 2)).to.have.members(["blocker-start", "bypass"]);

            await blocker;
        });

        it("iterable wrapper yields values correctly when queued", async () => {
            const queue = new Semaphore(1);

            async function* generator() {
                yield 1;
                yield 2;
                yield 3;
            }

            const iterable = iterableWithQueue(queue, true, generator);
            const result = await collect(iterable);

            expect(result).deep.equals([1, 2, 3]);
        });

        it("iterable wrapper respects queue ordering", async () => {
            const queue = new Semaphore(1);
            const executionOrder: string[] = [];

            async function* gen1() {
                executionOrder.push("gen1-start");
                yield "a";
                await MockTime.advance(10);
                yield "b";
                executionOrder.push("gen1-end");
            }

            async function* gen2() {
                executionOrder.push("gen2-start");
                yield "c";
                executionOrder.push("gen2-end");
            }

            const iter1 = iterableWithQueue(queue, true, gen1);
            const iter2 = iterableWithQueue(queue, true, gen2);

            const [result1, result2] = await Promise.all([collect(iter1), collect(iter2)]);

            expect(result1).deep.equals(["a", "b"]);
            expect(result2).deep.equals(["c"]);
            expect(executionOrder).deep.equals(["gen1-start", "gen1-end", "gen2-start", "gen2-end"]);
        });

        it("iterable wrapper waits when queue is at capacity", async () => {
            const queue = new Semaphore(1);
            const executionOrder: string[] = [];
            let resolveBlocker!: () => void;

            // Block the queue with a promise-based task
            const blocker = withOptionalQueue(queue, true, async () => {
                executionOrder.push("blocker-start");
                await new Promise<void>(r => (resolveBlocker = r));
                executionOrder.push("blocker-end");
            });

            async function* generator() {
                executionOrder.push("gen-start");
                yield "value";
                executionOrder.push("gen-end");
            }

            // Start iteration - should wait for blocker
            const iterPromise = collect(iterableWithQueue(queue, true, generator));

            // Give time for any incorrect immediate execution
            await MockTime.advance(10);

            // Generator should NOT have started yet
            expect(executionOrder).deep.equals(["blocker-start"]);

            // Release the blocker
            resolveBlocker();
            await blocker;

            // Now generator should run
            const result = await iterPromise;

            expect(result).deep.equals(["value"]);
            expect(executionOrder).deep.equals(["blocker-start", "blocker-end", "gen-start", "gen-end"]);
        });

        it("iterable wrapper handles errors correctly", async () => {
            const queue = new Semaphore(1);

            async function* failingGenerator() {
                yield 1;
                throw new Error("generator failed");
            }

            async function* successGenerator() {
                yield "success";
            }

            const iter1 = iterableWithQueue(queue, true, failingGenerator);
            const iter2 = iterableWithQueue(queue, true, successGenerator);

            // Start both
            const collect1 = collect(iter1);
            const collect2 = collect(iter2);

            // First should fail
            let error: Error | undefined;
            try {
                await collect1;
            } catch (e) {
                error = e as Error;
            }
            expect(error?.message).equals("generator failed");

            // Second should still succeed
            const result2 = await collect2;
            expect(result2).deep.equals(["success"]);
        });

        it("iterable wrapper yields values as they are produced", async () => {
            const queue = new Semaphore(1);
            const yieldTimes: number[] = [];
            const start = Date.now();

            async function* generator() {
                yield 1;
                await MockTime.advance(20);
                yield 2;
                await MockTime.advance(20);
                yield 3;
            }

            const iterable = iterableWithQueue(queue, true, generator);

            for await (const _value of iterable) {
                yieldTimes.push(Date.now() - start);
            }

            // Values should be yielded over time, not all at once
            expect(yieldTimes.length).equals(3);
            expect(yieldTimes[1] - yieldTimes[0]).to.be.greaterThanOrEqual(15);
            expect(yieldTimes[2] - yieldTimes[1]).to.be.greaterThanOrEqual(15);
        });
    });
});
