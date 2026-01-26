/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncIterator } from "#util/AsyncIterator.js";

// Helper to create an async iterator from an array with optional delays
async function* fromArray<T>(values: T[], delayMs = 0): AsyncGenerator<T> {
    for (const value of values) {
        if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        yield value;
    }
}

describe("AsyncIterator", () => {
    describe("merge", () => {
        it("merges two simple iterators", async () => {
            const iter1 = fromArray([1, 2]);
            const iter2 = fromArray([3, 4]);

            const results: number[] = [];
            for await (const value of AsyncIterator.merge([iter1, iter2])) {
                results.push(value);
            }

            expect(results).to.have.members([1, 2, 3, 4]);
            expect(results.length).equals(4);
        });

        it("handles empty iterators", async () => {
            const iter1 = fromArray<number>([]);
            const iter2 = fromArray<number>([]);

            const results: number[] = [];
            for await (const value of AsyncIterator.merge([iter1, iter2])) {
                results.push(value);
            }

            expect(results).to.deep.equal([]);
        });

        it("handles single iterator", async () => {
            const iter1 = fromArray([1, 2, 3]);

            const results: number[] = [];
            for await (const value of AsyncIterator.merge([iter1])) {
                results.push(value);
            }

            expect(results).to.deep.equal([1, 2, 3]);
        });

        it("handles mixed empty and non-empty iterators", async () => {
            const iter1 = fromArray<number>([]);
            const iter2 = fromArray([1, 2]);
            const iter3 = fromArray<number>([]);

            const results: number[] = [];
            for await (const value of AsyncIterator.merge([iter1, iter2, iter3])) {
                results.push(value);
            }

            expect(results).to.deep.equal([1, 2]);
        });

        it("yields results as they become available", async () => {
            // Create iterators with significantly different delays to ensure deterministic interleaving
            // iter1: yields at 40ms, 80ms
            // iter2: yields at 10ms, 20ms
            // Expected order: b1 (10ms), b2 (20ms), a1 (40ms), a2 (80ms)
            const iter1 = fromArray(["a1", "a2"], 40);
            const iter2 = fromArray(["b1", "b2"], 10);

            const results: string[] = [];
            for await (const value of AsyncIterator.merge([iter1, iter2])) {
                results.push(value);
            }

            // Verify the faster iterator's results come first
            expect(results).to.deep.equal(["b1", "b2", "a1", "a2"]);
        });

        it("collects errors and throws aggregate error", async () => {
            async function* errorIterator(): AsyncGenerator<number> {
                yield 1;
                throw new Error("Iterator 1 failed");
            }

            async function* normalIterator(): AsyncGenerator<number> {
                yield 2;
                yield 3;
            }

            const results: number[] = [];
            let caughtError: AggregateError | undefined;

            try {
                for await (const value of AsyncIterator.merge([errorIterator(), normalIterator()])) {
                    results.push(value);
                }
            } catch (e) {
                caughtError = e as AggregateError;
            }

            // Should have collected results before error
            expect(results).to.have.members([1, 2, 3]);

            // Should throw aggregate error
            expect(caughtError).to.be.instanceOf(AggregateError);
            expect(caughtError!.errors).to.have.length(1);
            expect(caughtError!.errors[0]).to.be.instanceOf(Error);
            expect((caughtError!.errors[0] as Error).message).equals("Iterator 1 failed");
        });

        it("collects multiple errors into aggregate error", async () => {
            // eslint-disable-next-line require-yield
            async function* errorIterator1(): AsyncGenerator<number> {
                throw new Error("Error 1");
            }

            // eslint-disable-next-line require-yield
            async function* errorIterator2(): AsyncGenerator<number> {
                throw new Error("Error 2");
            }

            let caughtError: AggregateError | undefined;

            try {
                for await (const _value of AsyncIterator.merge([errorIterator1(), errorIterator2()])) {
                    // Should not yield anything
                }
            } catch (e) {
                caughtError = e as AggregateError;
            }

            expect(caughtError).to.be.instanceOf(AggregateError);
            expect(caughtError!.errors).to.have.length(2);
        });

        it("uses custom error message", async () => {
            // eslint-disable-next-line require-yield
            async function* errorIterator(): AsyncGenerator<number> {
                throw new Error("fail");
            }

            let caughtError: AggregateError | undefined;

            try {
                for await (const _value of AsyncIterator.merge([errorIterator()], "Custom error message")) {
                    // Should not yield
                }
            } catch (e) {
                caughtError = e as AggregateError;
            }

            expect(caughtError).to.be.instanceOf(AggregateError);
            expect(caughtError!.message).equals("Custom error message");
        });

        it("handles many iterators", async () => {
            const iterators = Array.from({ length: 10 }, (_, i) => fromArray([i * 10, i * 10 + 1]));

            const results: number[] = [];
            for await (const value of AsyncIterator.merge(iterators)) {
                results.push(value);
            }

            expect(results.length).equals(20);
            // Check all expected values are present
            for (let i = 0; i < 10; i++) {
                expect(results).to.include(i * 10);
                expect(results).to.include(i * 10 + 1);
            }
        });

        it("handles iterators that yield different number of values", async () => {
            const iter1 = fromArray([1]);
            const iter2 = fromArray([2, 3, 4, 5]);
            const iter3 = fromArray([6, 7]);

            const results: number[] = [];
            for await (const value of AsyncIterator.merge([iter1, iter2, iter3])) {
                results.push(value);
            }

            expect(results).to.have.members([1, 2, 3, 4, 5, 6, 7]);
            expect(results.length).equals(7);
        });

        it("handles zero iterators", async () => {
            const results: number[] = [];
            for await (const value of AsyncIterator.merge<number>([])) {
                results.push(value);
            }

            expect(results).to.deep.equal([]);
        });
    });
});
