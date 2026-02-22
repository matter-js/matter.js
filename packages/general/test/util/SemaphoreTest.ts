/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbortedError, ClosedError } from "#MatterError.js";
import { Millis } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { Semaphore } from "#util/Semaphore.js";

describe("Semaphore", () => {
    describe("slot acquisition", () => {
        it("grants slot immediately when capacity available", async () => {
            const queue = new Semaphore("test", 1);

            const slot = await queue.obtainSlot();

            expect(queue.running).equals(1);
            expect(queue.count).equals(0);

            slot.close();
        });

        it("queues when at capacity", async () => {
            const queue = new Semaphore("test", 1);

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
            slot1.close();

            // Now slot2 should be granted
            const slot2 = await slot2Promise;
            expect(slot2Obtained).equals(true);
            expect(queue.running).equals(1);
            expect(queue.count).equals(0);

            slot2.close();
        });

        it("releases slot via dispose", async () => {
            const queue = new Semaphore("test", 1);

            {
                using _slot = await queue.obtainSlot();
                expect(queue.running).equals(1);
            }

            // After scope exit, slot should be released
            expect(queue.running).equals(0);
        });

        it("release is idempotent", async () => {
            const queue = new Semaphore("test", 1);

            const slot = await queue.obtainSlot();
            expect(queue.running).equals(1);

            slot.close();
            expect(queue.running).equals(0);

            // Second release should be no-op
            slot.close();
            expect(queue.running).equals(0);
        });
    });

    describe("concurrency", () => {
        it("respects concurrency limit of 1", async () => {
            const queue = new Semaphore("test", 1);
            const executionOrder: string[] = [];

            const task1 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task1-start");
                await new Promise(resolve => setTimeout(resolve, 10));
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
            const queue = new Semaphore("test", 2);
            const executionOrder: string[] = [];

            const task1 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task1-start");
                await new Promise(resolve => setTimeout(resolve, 20));
                executionOrder.push("task1-end");
            })();

            const task2 = (async () => {
                using _slot = await queue.obtainSlot();
                executionOrder.push("task2-start");
                await new Promise(resolve => setTimeout(resolve, 10));
                executionOrder.push("task2-end");
            })();

            await Promise.all([task1, task2]);

            // Both should start before either ends
            expect(executionOrder.slice(0, 2)).to.have.members(["task1-start", "task2-start"]);
        });

        it("respects concurrency limit of 3", async () => {
            const queue = new Semaphore("test", 3);
            let runningCount = 0;
            let maxRunning = 0;

            const createTask = () =>
                (async () => {
                    using _slot = await queue.obtainSlot();
                    runningCount++;
                    maxRunning = Math.max(maxRunning, runningCount);
                    await new Promise(resolve => setTimeout(resolve, 10));
                    runningCount--;
                })();

            await Promise.all([createTask(), createTask(), createTask(), createTask(), createTask()]);

            expect(maxRunning).equals(3);
        });

        it("with concurrency 3, tasks 1-3 start before task 4", async () => {
            const queue = new Semaphore("test", 3);
            const startOrder: number[] = [];
            const endOrder: number[] = [];

            const createTask = (id: number, delay: number) =>
                (async () => {
                    using _slot = await queue.obtainSlot();
                    startOrder.push(id);
                    await new Promise(resolve => setTimeout(resolve, delay));
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
            const queue = new Semaphore("test", 2);
            const events: string[] = [];

            const createTask = (id: number, delay: number) =>
                (async () => {
                    using _slot = await queue.obtainSlot();
                    events.push(`start-${id}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
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
            const queue = new Semaphore("test", 1);
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
            await new Promise(resolve => setTimeout(resolve, 10));

            // Release the blocker
            resolveBlocker();

            await Promise.all([t2, t3, t4]);

            // Tasks should execute in order they were added
            expect(executionOrder).deep.equals([1, 2, 3, 4]);
        });
    });

    describe("abort handling", () => {
        it("throws if abort signal is already aborted", async () => {
            const queue = new Semaphore("test", 1);
            const abort = new Abort();
            abort(new ClosedError("pre-aborted"));

            let error: Error | undefined;
            try {
                await queue.obtainSlot(abort);
            } catch (e) {
                error = e as Error;
            }

            expect(error).to.be.instanceOf(AbortedError);
            expect(error?.cause).to.be.instanceOf(ClosedError);
        });

        it("rejects queued request when abort signal fires", async () => {
            const queue = new Semaphore("test", 1);

            // Take the only slot
            const slot1 = await queue.obtainSlot();

            // Queue a second request with abort
            const abortController = new AbortController();
            const slot2Promise = queue.obtainSlot(abortController.signal);

            expect(queue.count).equals(1);

            // Abort while waiting
            abortController.abort(new ClosedError("cancelled"));

            let error: Error | undefined;
            try {
                await slot2Promise;
            } catch (e) {
                error = e as Error;
            }

            expect(error).to.be.instanceOf(AbortedError);
            expect(error?.cause).to.be.instanceOf(ClosedError);
            expect(queue.count).equals(0); // Should be removed from queue

            slot1.close();
        });

        it("abort does not affect requests without abort signal", async () => {
            const queue = new Semaphore("test", 1);

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
            slot1.close();

            const slot3 = await slot3Promise;
            expect(queue.running).equals(1);

            slot3.close();
        });

        it("works with Abort utility class", async () => {
            const queue = new Semaphore("test", 1);

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

            slot1.close();
            abort.close();
        });
    });

    describe("queue management", () => {
        it("reports correct count", async () => {
            const queue = new Semaphore("test", 1);

            expect(queue.count).equals(0);
            expect(queue.running).equals(0);

            const slot1 = await queue.obtainSlot();
            expect(queue.count).equals(0);
            expect(queue.running).equals(1);

            const slot2Promise = queue.obtainSlot();
            expect(queue.count).equals(1);

            const slot3Promise = queue.obtainSlot();
            expect(queue.count).equals(2);

            slot1.close();
            const slot2 = await slot2Promise;
            expect(queue.count).equals(1);

            slot2.close();
            const slot3 = await slot3Promise;
            expect(queue.count).equals(0);

            slot3.close();
        });

        it("clear rejects all pending requests", async () => {
            const queue = new Semaphore("test", 1);

            const slot1 = await queue.obtainSlot();
            const slot2Promise = queue.obtainSlot();
            const slot3Promise = queue.obtainSlot();

            expect(queue.count).equals(2);

            queue.clear();

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

            slot1.close();
        });

        it("close() marks queue as closed and rejects pending", async () => {
            const queue = new Semaphore("test", 1);

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
            expect(newError).to.be.instanceOf(ClosedError);

            slot1.close();
        });
    });

    describe("async iterator pattern", () => {
        it("works with async iterators using slot", async () => {
            const queue = new Semaphore("test", 1);

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
            const queue = new Semaphore("test", 1);
            const executionOrder: string[] = [];

            async function* gen1() {
                executionOrder.push("gen1-start");
                yield "a";
                await new Promise(resolve => setTimeout(resolve, 10));
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
            const queue = new Semaphore("test", 1);

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
            const queue = new Semaphore("test", 1);

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

            slot1.close();
        });
    });

    describe("slot timeout", () => {
        before(() => MockTime.enable());

        it("auto-releases slot after timeout", async () => {
            const queue = new Semaphore("test", 1, 0, Millis(100));

            const slot = await queue.obtainSlot();
            expect(queue.running).equals(1);

            // Advance time past the timeout
            await MockTime.advance(101);
            await MockTime.yield();

            expect(queue.running).equals(0);

            // Manual close after auto-release should be a no-op
            slot.close();
            expect(queue.running).equals(0);
        });

        it("manual release before timeout cancels the timer", async () => {
            const queue = new Semaphore("test", 1, 0, Millis(100));

            const slot = await queue.obtainSlot();
            expect(queue.running).equals(1);

            // Release manually before timeout
            slot.close();
            expect(queue.running).equals(0);

            // Advance past timeout - should not cause issues
            await MockTime.advance(200);
            await MockTime.yield();

            expect(queue.running).equals(0);
        });

        it("queued task gets slot after timeout auto-release", async () => {
            const queue = new Semaphore("test", 1, 0, Millis(100));

            // Take the only slot
            await queue.obtainSlot();
            expect(queue.running).equals(1);

            // Queue a second request
            let slot2Obtained = false;
            const slot2Promise = queue.obtainSlot().then(slot => {
                slot2Obtained = true;
                return slot;
            });

            await MockTime.yield();
            expect(slot2Obtained).equals(false);
            expect(queue.count).equals(1);

            // Advance past timeout - slot1 auto-releases, slot2 should get granted
            await MockTime.advance(101);
            await MockTime.yield();

            const slot2 = await slot2Promise;
            expect(slot2Obtained).equals(true);
            expect(queue.running).equals(1);
            expect(queue.count).equals(0);

            slot2.close();
        });

        it("each slot gets its own timeout", async () => {
            const queue = new Semaphore("test", 2, 0, Millis(100));

            const slot1 = await queue.obtainSlot();
            expect(queue.running).equals(1);

            // Advance 50ms, then obtain second slot
            await MockTime.advance(50);
            const slot2 = await queue.obtainSlot();
            expect(queue.running).equals(2);

            // At 101ms, slot1 should timeout but slot2 still active
            await MockTime.advance(51);
            await MockTime.yield();

            expect(queue.running).equals(1);

            // At 151ms, slot2 should also timeout
            await MockTime.advance(50);
            await MockTime.yield();

            expect(queue.running).equals(0);

            slot1.close();
            slot2.close();
        });

        it("no timeout when not configured", async () => {
            const queue = new Semaphore("test", 1);

            const slot = await queue.obtainSlot();
            expect(queue.running).equals(1);

            // Advance a lot of time - slot should remain
            await MockTime.advance(10000);
            await MockTime.yield();

            expect(queue.running).equals(1);

            slot.close();
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
                    slot.close();
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
                    slot.close();
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
            const queue = new Semaphore("test", 1);
            const result = await withOptionalQueue(queue, true, async () => "success");
            expect(result).equals("success");
        });

        it("wrapper respects queue ordering", async () => {
            const queue = new Semaphore("test", 1);
            const executionOrder: string[] = [];

            const task1 = withOptionalQueue(queue, true, async () => {
                executionOrder.push("task1-start");
                await new Promise(resolve => setTimeout(resolve, 10));
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
            const queue = new Semaphore("test", 1);
            const executionOrder: string[] = [];

            // Block the queue
            const blocker = withOptionalQueue(queue, true, async () => {
                executionOrder.push("blocker-start");
                await new Promise(resolve => setTimeout(resolve, 50));
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
            const queue = new Semaphore("test", 1);

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
            const queue = new Semaphore("test", 1);
            const executionOrder: string[] = [];

            async function* gen1() {
                executionOrder.push("gen1-start");
                yield "a";
                await new Promise(resolve => setTimeout(resolve, 10));
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
            const queue = new Semaphore("test", 1);
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
            await new Promise(resolve => setTimeout(resolve, 10));

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
            const queue = new Semaphore("test", 1);

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
            const queue = new Semaphore("test", 1);
            const yieldTimes: number[] = [];
            const start = Date.now();

            async function* generator() {
                yield 1;
                await new Promise(resolve => setTimeout(resolve, 20));
                yield 2;
                await new Promise(resolve => setTimeout(resolve, 20));
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
