/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RetrySchedule } from "#net/RetrySchedule.js";
import { Seconds, Minutes, Millis } from "#time/TimeUnit.js";
import { Entropy } from "#util/Entropy.js";
import { Bytes } from "#util/Bytes.js";

// Test entropy implementation with predictable values
class TestEntropy extends Entropy {
    private values: number[];
    private index = 0;

    constructor(values: number[]) {
        super();
        this.values = values;
    }

    randomBytes(length: number): Bytes {
        const result = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            result[i] = (this.values[this.index % this.values.length] >> (i * 8)) & 0xff;
        }
        this.index++;
        return result;
    }
}

describe("RetrySchedule", () => {
    describe("basic iteration", () => {
        it("yields intervals with default configuration", () => {
            const entropy = new TestEntropy([0]); // Predictable entropy for testing
            const schedule = new RetrySchedule(entropy, { maximumCount: 3 });

            const intervals = Array.from(schedule);

            expect(intervals).length(3);
            // First interval: 1s (default initialInterval)
            expect(intervals[0]).equal(Seconds.one);
            // Second interval: 2s (backoffFactor of 2)
            expect(intervals[1]).equal(Seconds(2));
            // Third interval: 4s (backoffFactor of 2)
            expect(intervals[2]).equal(Seconds(4));
        });

        it("respects initialInterval configuration", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(5),
                maximumCount: 2,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(5));
            expect(intervals[1]).equal(Seconds(10));
        });

        it("applies backoffFactor correctly", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 3,
                maximumCount: 3,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(1));
            expect(intervals[1]).equal(Seconds(3));
            expect(intervals[2]).equal(Seconds(9));
        });
    });

    describe("maximum count", () => {
        it("stops after maximumCount iterations", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, { maximumCount: 5 });

            const intervals = Array.from(schedule);

            expect(intervals).length(5);
        });

        it("allows indefinite iteration when maximumCount is undefined", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {});

            let count = 0;
            for (const _interval of schedule) {
                count++;
                if (count >= 100) break; // Safety limit for test
            }

            expect(count).equal(100);
        });

        it("returns empty when maximumCount is 0", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, { maximumCount: 0 });

            const intervals = Array.from(schedule);

            expect(intervals).length(0);
        });
    });

    describe("timeout", () => {
        it("stops when timeout is reached", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                timeout: Seconds(10),
            });

            const intervals = Array.from(schedule);

            // Should yield: 1s, 2s, 4s (total: 7s)
            // Next would be 8s but that would exceed 10s timeout
            // So it adjusts to 3s to exactly fill the timeout
            expect(intervals).length(4);
            expect(intervals[0]).equal(Seconds(1));
            expect(intervals[1]).equal(Seconds(2));
            expect(intervals[2]).equal(Seconds(4));
            expect(intervals[3]).equal(Seconds(3)); // Adjusted to fit
        });

        it("adjusts final interval to fit within timeout", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                timeout: Seconds(8),
            });

            const intervals = Array.from(schedule);

            // Should yield: 1s, 2s, 4s (total: 7s)
            // Next would be 8s but adjusted to 1s to fit 8s timeout
            expect(intervals).length(4);
            expect(intervals[0]).equal(Seconds(1));
            expect(intervals[1]).equal(Seconds(2));
            expect(intervals[2]).equal(Seconds(4));
            expect(intervals[3]).equal(Seconds(1)); // Adjusted to fit
        });

        it("combines timeout and maximumCount (timeout reached first)", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                timeout: Seconds(5),
                maximumCount: 10,
            });

            const intervals = Array.from(schedule);

            // Timeout limits: 1s, 2s (total: 3s), next would exceed timeout
            expect(intervals).length(3);
        });

        it("combines timeout and maximumCount (count reached first)", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                timeout: Minutes(10),
                maximumCount: 3,
            });

            const intervals = Array.from(schedule);

            // Count limits before timeout
            expect(intervals).length(3);
        });
    });

    describe("maximumInterval", () => {
        it("caps intervals at maximumInterval", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                maximumInterval: Seconds(5),
                maximumCount: 5,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(1));
            expect(intervals[1]).equal(Seconds(2));
            expect(intervals[2]).equal(Seconds(4));
            expect(intervals[3]).equal(Seconds(5)); // Capped at maximumInterval
            expect(intervals[4]).equal(Seconds(5)); // Capped at maximumInterval
        });

        it("applies maximumInterval before timeout adjustment", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                maximumInterval: Seconds(3),
                timeout: Seconds(10),
            });

            const intervals = Array.from(schedule);

            // Should yield: 1s, 2s, 3s (capped), 3s (capped), total would be 9s
            // Next 3s would exceed timeout, so adjusted to 1s to fill exactly 10s
            expect(intervals).length(5);
            expect(intervals[0]).equal(Seconds(1));
            expect(intervals[1]).equal(Seconds(2));
            expect(intervals[2]).equal(Seconds(3));
            expect(intervals[3]).equal(Seconds(3));
            expect(intervals[4]).equal(Seconds(1)); // Adjusted to fit
        });
    });

    describe("jitter", () => {
        it("adds jitter to intervals", () => {
            // Use maximum entropy value to get maximum jitter
            const entropy = new TestEntropy([0xffffffff]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(10),
                jitterFactor: 0.5, // 50% jitter
                maximumCount: 1,
            });

            const intervals = Array.from(schedule);

            // With max entropy, jitter should be close to 50% of 10s = 5s
            // So interval should be close to 15s
            expect(intervals[0]).greaterThan(Seconds(14));
            expect(intervals[0]).lessThanOrEqual(Seconds(15));
        });

        it("jitter is 0 when jitterFactor is 0", () => {
            const entropy = new TestEntropy([0xffffffff]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(10),
                jitterFactor: 0,
                maximumCount: 1,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(10));
        });

        it("jitter is 0 when jitterFactor is undefined", () => {
            const entropy = new TestEntropy([0xffffffff]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(10),
                maximumCount: 1,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(10));
        });

        it("applies different jitter to each interval", () => {
            // Entropy with varying values
            const entropy = new TestEntropy([0, 0xffffffff, 0x7fffffff]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(10),
                jitterFactor: 0.5,
                maximumCount: 3,
            });

            const intervals = Array.from(schedule);

            // Each interval should have different jitter based on entropy
            expect(intervals[0]).equal(Seconds(10)); // Min jitter (entropy 0)
            expect(intervals[1]).greaterThan(Seconds(24)); // Max jitter
            expect(intervals[2]).greaterThan(Seconds(40)); // Mid jitter
        });
    });

    describe("Configuration helper", () => {
        it("merges configuration with defaults", () => {
            const defaults: RetrySchedule.Configuration = {
                initialInterval: Seconds(2),
                backoffFactor: 3,
                maximumCount: 10,
            };

            const config = RetrySchedule.Configuration(defaults, {
                backoffFactor: 4,
                timeout: Minutes(1),
            });

            expect(config.initialInterval).equal(Seconds(2)); // From defaults
            expect(config.backoffFactor).equal(4); // Overridden
            expect(config.maximumCount).equal(10); // From defaults
            expect(config.timeout).equal(Minutes(1)); // Added
        });

        it("returns defaults when no override provided", () => {
            const defaults: RetrySchedule.Configuration = {
                initialInterval: Seconds(2),
                backoffFactor: 3,
            };

            const config = RetrySchedule.Configuration(defaults);

            expect(config.initialInterval).equal(Seconds(2));
            expect(config.backoffFactor).equal(3);
        });
    });

    describe("edge cases", () => {
        it("handles very small intervals", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Millis(1),
                maximumCount: 3,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Millis(1));
            expect(intervals[1]).equal(Millis(2));
            expect(intervals[2]).equal(Millis(4));
        });

        it("handles backoffFactor of 1 (no growth)", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(5),
                backoffFactor: 1,
                maximumCount: 3,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(5));
            expect(intervals[1]).equal(Seconds(5));
            expect(intervals[2]).equal(Seconds(5));
        });

        it("handles fractional backoffFactor", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(8),
                backoffFactor: 0.5, // Decrease interval
                maximumCount: 3,
            });

            const intervals = Array.from(schedule);

            expect(intervals[0]).equal(Seconds(8));
            expect(intervals[1]).equal(Seconds(4));
            expect(intervals[2]).equal(Seconds(2));
        });
    });

    describe("accumulation of time", () => {
        it("tracks total time correctly", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                timeout: Seconds(15),
            });

            const intervals = Array.from(schedule);
            const totalTime = intervals.reduce((sum, interval) => Millis(sum + interval), Millis(0));

            // Should be: 1 + 2 + 4 + 8 = 15s (exactly at timeout)
            expect(totalTime).lessThanOrEqual(Seconds(15));
        });

        it("never exceeds timeout with accumulated time", () => {
            const entropy = new TestEntropy([0]);
            const schedule = new RetrySchedule(entropy, {
                initialInterval: Seconds(1),
                backoffFactor: 2,
                timeout: Seconds(100),
            });

            const intervals = Array.from(schedule);
            const totalTime = intervals.reduce((sum, interval) => Millis(sum + interval), Millis(0));

            expect(totalTime).lessThanOrEqual(Seconds(100));
        });
    });
});
