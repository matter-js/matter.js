/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilities for working with async iterators.
 */
export namespace AsyncIterator {
    /**
     * Merge multiple async iterators, yielding results as they become available from any iterator.
     *
     * Results are yielded in the order they resolve, not the order of iterators.
     * Errors from individual iterators are collected and thrown as an aggregate error after all iterators complete.
     *
     * @param iterators The async iterables to merge
     * @param errorMessage Optional message for the aggregate error if any iterators fail
     */
    export async function* merge<T>(
        iterators: AsyncIterable<T>[],
        errorMessage = "One or more async iterators failed",
    ): AsyncGenerator<T> {
        const asyncIterators = iterators.map(iter => iter[Symbol.asyncIterator]());
        const pending = new Map<number, Promise<{ index: number; result: IteratorResult<T> }>>();
        const errors: Error[] = [];

        // Initialize with first .next() call for each iterator
        for (let i = 0; i < asyncIterators.length; i++) {
            pending.set(
                i,
                asyncIterators[i].next().then(
                    result => ({ index: i, result }),
                    error => {
                        // On error, mark as done and collect error
                        errors.push(error);
                        return { index: i, result: { done: true, value: undefined } as IteratorResult<T> };
                    },
                ),
            );
        }

        while (pending.size > 0) {
            // Race all pending promises
            const { index, result } = await Promise.race(pending.values());

            if (result.done) {
                pending.delete(index);
            } else {
                yield result.value;
                // Queue next value from this iterator
                pending.set(
                    index,
                    asyncIterators[index].next().then(
                        result => ({ index, result }),
                        error => {
                            errors.push(error);
                            return { index, result: { done: true, value: undefined } as IteratorResult<T> };
                        },
                    ),
                );
            }
        }

        // After all iterators complete, throw aggregate error if any occurred
        if (errors.length > 0) {
            throw new AggregateError(errors, errorMessage);
        }
    }
}
