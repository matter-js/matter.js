/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardTime, StandardTimer } from "#time/StandardTime.js";
import { Millis } from "#time/TimeUnit.js";
import { INT32_MAX } from "#util/Number.js";
import { createPromise } from "#util/Promises.js";

/**
 * Replaces the global timer factories with stubs that return a shared fake timer whose ref/unref calls are counted,
 * so we can observe whether {@link StandardTimer} unrefs the underlying timer.
 */
function withStubbedTimers(test: (counts: { ref: number; unref: number }) => void) {
    const counts = { ref: 0, unref: 0 };
    const fake = {
        ref() {
            counts.ref++;
        },
        unref() {
            counts.unref++;
        },
    };
    const original = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval };
    globalThis.setTimeout = (() => fake) as unknown as typeof setTimeout;
    globalThis.setInterval = (() => fake) as unknown as typeof setInterval;
    try {
        test(counts);
    } finally {
        globalThis.setTimeout = original.setTimeout;
        globalThis.setInterval = original.setInterval;
    }
}

describe("StandardTime", () => {
    const time = new StandardTime();

    describe("timer factories", () => {
        it("creates a one-shot timer", () => {
            const timer = time.getTimer("test", Millis(10), () => {});
            expect(timer).instanceOf(StandardTimer);
            expect(timer.isPeriodic).equal(false);
        });

        it("creates a periodic timer", () => {
            const timer = time.getPeriodicTimer("test", Millis(10), () => {});
            expect(timer.isPeriodic).equal(true);
        });
    });

    describe("interval validation", () => {
        it("rejects a negative interval", () => {
            expect(() => new StandardTimer("t", Millis(-1), () => {}, false)).throws("not negative");
        });

        it("rejects an infinite interval", () => {
            expect(() => new StandardTimer("t", Millis(Infinity), () => {}, false)).throws("must be finite");
        });
    });

    describe("lifecycle", () => {
        it("tracks running state across start and stop", () => {
            const timer = new StandardTimer("t", Millis(10_000), () => {}, false);

            expect(timer.isRunning).equal(false);
            timer.start();
            expect(timer.isRunning).equal(true);
            timer.stop();
            expect(timer.isRunning).equal(false);
        });

        it("fires a one-shot timer and clears running state", async () => {
            const { promise, resolver } = createPromise<void>();
            const timer = new StandardTimer("t", Millis(1), () => resolver(), false);

            timer.start();
            await promise;

            expect(timer.isRunning).equal(false);
        });
    });
});

interface RecordedStep {
    delay: number;
    run: () => void;
    unrefs: number;
}

/**
 * Replaces `setTimeout` and `clearTimeout` with stubs that record each step instead of scheduling it, so a test can run
 * the steps of a long timer without waiting.  A step's handle is its index in `steps`.
 */
function withRecordedTimeouts(test: (steps: RecordedStep[], cleared: unknown[]) => void) {
    const steps = new Array<RecordedStep>();
    const cleared = new Array<unknown>();
    const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
    globalThis.setTimeout = ((run: () => void, delay: number) => {
        const step: RecordedStep = { delay, run, unrefs: 0 };
        steps.push(step);
        return {
            index: steps.length - 1,
            unref() {
                step.unrefs++;
            },
        };
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((handle: { index: number }) => {
        cleared.push(handle?.index);
    }) as unknown as typeof clearTimeout;
    try {
        test(steps, cleared);
    } finally {
        globalThis.setTimeout = original.setTimeout;
        globalThis.clearTimeout = original.clearTimeout;
    }
}

const MAX_STEP_MS = INT32_MAX;

describe("StandardTimer", () => {
    describe("intervals beyond the setTimeout maximum", () => {
        it("runs an interval of exactly the maximum as one step", () => {
            withRecordedTimeouts(steps => {
                let fired = 0;
                new StandardTimer("t", Millis(MAX_STEP_MS), () => fired++, false).start();

                steps[0].run();
                expect(steps.map(({ delay }) => delay)).deep.equals([MAX_STEP_MS]);
                expect(fired).equals(1);
            });
        });

        it("fires a one-shot timer only after the full interval", () => {
            withRecordedTimeouts(steps => {
                let fired = 0;
                const timer = new StandardTimer("t", Millis(2 * MAX_STEP_MS + 5), () => fired++, false).start();

                steps[0].run();
                steps[1].run();
                expect(steps.map(({ delay }) => delay)).deep.equals([MAX_STEP_MS, MAX_STEP_MS, 5]);
                expect(fired).equals(0);
                expect(timer.isRunning).true;

                steps[2].run();
                expect(fired).equals(1);
                expect(timer.isRunning).false;
            });
        });

        it("re-arms a periodic timer with the interval it started with", () => {
            withRecordedTimeouts(steps => {
                let fired = 0;
                const timer = new StandardTimer("t", Millis(MAX_STEP_MS + 1), () => fired++, true).start();
                timer.interval = Millis(10);

                steps[0].run();
                steps[1].run();
                expect(fired).equals(1);
                expect(timer.isRunning).true;
                expect(steps.map(({ delay }) => delay)).deep.equals([MAX_STEP_MS, 1, MAX_STEP_MS]);

                timer.stop();
            });
        });

        it("clears the pending step on stop", () => {
            withRecordedTimeouts((steps, cleared) => {
                const timer = new StandardTimer("t", Millis(2 * MAX_STEP_MS), () => {}, false).start();

                steps[0].run();
                timer.stop();

                expect(cleared).deep.equals([1]);
                expect(timer.isRunning).false;
            });
        });

        it("stays stopped when a periodic callback stops it", () => {
            withRecordedTimeouts((steps, cleared) => {
                const timer: StandardTimer = new StandardTimer(
                    "t",
                    Millis(MAX_STEP_MS + 1),
                    () => timer.stop(),
                    true,
                ).start();

                steps[0].run();
                steps[1].run();

                expect(cleared).deep.equals([2]);
                expect(timer.isRunning).false;
            });
        });

        it("unrefs every step of a utility timer", () => {
            withRecordedTimeouts(steps => {
                const timer = new StandardTimer("t", Millis(2 * MAX_STEP_MS + 5), () => {}, false);
                timer.utility = true;
                timer.start();

                steps[0].run();
                steps[1].run();

                expect(steps.map(({ unrefs }) => unrefs)).deep.equals([1, 1, 1]);
            });
        });
    });

    describe("utility/unref", () => {
        it("unrefs the timer when utility is set before start (non-periodic)", () => {
            withStubbedTimers(counts => {
                const timer = new StandardTimer("test", Millis(1000), () => {}, false);
                timer.utility = true;
                timer.start();
                expect(counts.unref).equal(1);
                timer.stop();
            });
        });

        it("unrefs the timer when utility is set before start (periodic)", () => {
            withStubbedTimers(counts => {
                const timer = new StandardTimer("test", Millis(1000), () => {}, true);
                timer.utility = true;
                timer.start();
                expect(counts.unref).equal(1);
                timer.stop();
            });
        });

        it("does not unref a non-utility timer", () => {
            withStubbedTimers(counts => {
                const timer = new StandardTimer("test", Millis(1000), () => {}, false);
                timer.start();
                expect(counts.unref).equal(0);
                timer.stop();
            });
        });

        it("unrefs the timer when utility is set after start", () => {
            withStubbedTimers(counts => {
                const timer = new StandardTimer("test", Millis(1000), () => {}, false);
                timer.start();
                expect(counts.unref).equal(0);
                timer.utility = true;
                expect(counts.unref).equal(1);
                timer.stop();
            });
        });
    });
});
