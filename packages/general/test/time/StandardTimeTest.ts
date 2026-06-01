/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardTime, StandardTimer } from "#time/StandardTime.js";
import { Millis } from "#time/TimeUnit.js";
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
            expect(() => new StandardTimer("t", Millis(-1), () => {}, false)).throws("must be between");
        });

        it("rejects an interval beyond the 32-bit maximum", () => {
            expect(() => new StandardTimer("t", Millis(2_147_483_648), () => {}, false)).throws("must be between");
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

describe("StandardTimer", () => {
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
