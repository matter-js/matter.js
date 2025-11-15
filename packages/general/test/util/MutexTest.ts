/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mutex, MutexClosedError } from "#util/Mutex.js";

describe("Mutex", () => {
    describe("run", () => {
        it("executes tasks sequentially", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(async () => {
                results.push(1);
            });
            mutex.run(async () => {
                results.push(2);
            });
            mutex.run(async () => {
                results.push(3);
            });

            await mutex;

            expect(results).deep.equal([1, 2, 3]);
        });

        it("handles async tasks with delays", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                results.push(1);
            });
            mutex.run(async () => {
                results.push(2);
            });

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("queues tasks during execution", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];
            let firstTaskStarted = false;
            let firstTaskCompleted = false;

            mutex.run(async () => {
                firstTaskStarted = true;
                await new Promise(resolve => setTimeout(resolve, 20));
                firstTaskCompleted = true;
                results.push(1);
            });

            // Wait a bit to ensure first task has started
            await new Promise(resolve => setTimeout(resolve, 5));
            expect(firstTaskStarted).equal(true);
            expect(firstTaskCompleted).equal(false);

            mutex.run(async () => {
                expect(firstTaskCompleted).equal(true);
                results.push(2);
            });

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("accepts PromiseLike as task", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(
                Promise.resolve().then(() => {
                    results.push(1);
                }),
            );
            mutex.run(
                Promise.resolve().then(() => {
                    results.push(2);
                }),
            );

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("throws MutexClosedError when closed", async () => {
            const mutex = new Mutex({});
            await mutex.close();

            expect(() => mutex.run(async () => {})).throws(MutexClosedError, "Cannot schedule task because mutex is closed");
        });
    });

    describe("produce", () => {
        it("returns task result", async () => {
            const mutex = new Mutex({});

            const result = await mutex.produce(async () => {
                return 42;
            });

            expect(result).equal(42);
        });

        it("queues tasks and returns results in order", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            const promise1 = mutex.produce(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                results.push(1);
                return "first";
            });

            const promise2 = mutex.produce(async () => {
                results.push(2);
                return "second";
            });

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).equal("first");
            expect(result2).equal("second");
            expect(results).deep.equal([1, 2]);
        });

        it("rejects when task throws error", async () => {
            const mutex = new Mutex({});

            const promise = mutex.produce(async () => {
                throw new Error("task failed");
            });

            await expect(promise).rejectedWith(Error, "task failed");
        });

        it("throws MutexClosedError when closed", async () => {
            const mutex = new Mutex({});
            await mutex.close();

            expect(() => mutex.produce(async () => 42)).throws(MutexClosedError, "Cannot schedule task because mutex is closed");
        });
    });

    describe("lock", () => {
        it("acquires and releases lock", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            const lockPromise = mutex.lock();
            const lock = await lockPromise;

            results.push(1);
            lock[Symbol.dispose]();

            mutex.run(async () => {
                results.push(2);
            });

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("prevents other tasks while locked", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            const lock = await mutex.lock();

            mutex.run(async () => {
                results.push(2);
            });

            // Give task a chance to run (it shouldn't while locked)
            await new Promise(resolve => setTimeout(resolve, 10));
            expect(results).deep.equal([]);

            results.push(1);
            lock[Symbol.dispose]();

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("supports using statement pattern", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            {
                using _lock = await mutex.lock();
                results.push(1);
            }

            mutex.run(async () => {
                results.push(2);
            });

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("throws MutexClosedError when closed", async () => {
            const mutex = new Mutex({});
            await mutex.close();

            await expect(mutex.lock()).rejectedWith(MutexClosedError, "Cannot schedule task because mutex is closed");
        });
    });

    describe("close", () => {
        it("waits for pending tasks to complete", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                results.push(1);
            });

            await mutex.close();

            expect(results).deep.equal([1]);
        });

        it("prevents new tasks after closing", async () => {
            const mutex = new Mutex({});

            mutex.run(async () => {
                await new Promise(resolve => setTimeout(resolve, 5));
            });

            const closePromise = mutex.close();

            expect(() => mutex.run(async () => {})).throws(MutexClosedError);

            await closePromise;
        });

        it("can be called multiple times", async () => {
            const mutex = new Mutex({});

            await mutex.close();
            await mutex.close();
            await mutex.close();
        });
    });

    describe("then (PromiseLike)", () => {
        it("can be awaited", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(async () => {
                results.push(1);
            });

            await mutex;

            expect(results).deep.equal([1]);
        });

        it("resolves when current activity completes", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                results.push(1);
            });

            const promise = mutex.then(() => {
                results.push(2);
            });

            // Queue another task while first is running
            mutex.run(async () => {
                results.push(3);
            });

            await promise;
            await mutex;

            // then() should resolve after first task, before the second queued task
            expect(results).deep.equal([1, 2, 3]);
        });
    });

    describe("constructor with initial task", () => {
        it("executes initial task", async () => {
            const results: number[] = [];

            const mutex = new Mutex(
                {},
                Promise.resolve().then(() => {
                    results.push(1);
                }),
            );

            await mutex;

            expect(results).deep.equal([1]);
        });

        it("queues subsequent tasks after initial task", async () => {
            const results: number[] = [];

            const mutex = new Mutex(
                {},
                Promise.resolve().then(async () => {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    results.push(1);
                }),
            );

            mutex.run(async () => {
                results.push(2);
            });

            await mutex;

            expect(results).deep.equal([1, 2]);
        });
    });

    describe("error handling", () => {
        it("logs errors from run tasks but continues", async () => {
            const mutex = new Mutex({});
            const results: number[] = [];

            mutex.run(async () => {
                results.push(1);
                throw new Error("first task error");
            });

            mutex.run(async () => {
                results.push(2);
            });

            await mutex;

            expect(results).deep.equal([1, 2]);
        });

        it("does not propagate errors from run to awaiter", async () => {
            const mutex = new Mutex({});

            mutex.run(async () => {
                throw new Error("task error");
            });

            await mutex; // Should not throw

            // If we got here without error, test passes
            expect(true).equal(true);
        });
    });
});
