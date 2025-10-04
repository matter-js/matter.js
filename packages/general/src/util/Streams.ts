/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError, TimeoutError } from "#MatterError.js";
import { MaybePromise } from "./Promises.js";

/**
 * Generic error thrown when a stream closes in a context where we expected a value.
 */
export class EndOfStreamError extends MatterError {
    constructor(message = "Unexpected end of stream") {
        super(message);
    }
}

/**
 * Timeout specific to cases where we were expecting a value.
 */
export class NoResponseTimeoutError extends TimeoutError {}

/**
 * A generic iterator type that accepts both async and normal iterators.
 */
export type MaybeAsyncIterable<T> = Iterable<T, void, void> | AsyncIterable<T, void, void>;

export namespace Stream {
    /**
     * Ponyfill for standard ReadableStream.from().
     *
     * If defined, we use the native implementation.  Otherwise we create the stream ourselves.
     */
    export function from<T>(iterable: MaybeAsyncIterable<T>): ReadableStream<T> {
        if ("from" in ReadableStream) {
            return (ReadableStream as { from(iterable: MaybeAsyncIterable<T>): ReadableStream<T> }).from(iterable);
        }

        return AnyIterableReadableStream(iterable);
    }

    /**
     * Ponyfill for standard ReadableStream#[Symbol.asyncIterator].
     *
     * If defined, we use the native implementation.  Otherwise we create the iterator ourselves.  Currently only
     * necessary on Safari.
     */
    export async function* iterable<T>(stream: ReadableStream<T>): AsyncGenerator<T, void, void> {
        if (Symbol.asyncIterator in stream) {
            yield* stream as AsyncIterable<T, void, void>;
            return;
        }

        const reader = stream.getReader();
        try {
            while (true) {
                const next = await reader.read();
                if (next.done) {
                    return;
                }

                yield next.value;
            }
        } finally {
            reader.releaseLock();
        }
    }
}

/**
 * Iterable-backed ReadableStream implementation.
 *
 * We prefer the native ReadableStream.from which is supported on Node.js 20.6+ as well as Deno and Bun.  This may
 * require additional testing if required for support on other platforms.
 */
function AnyIterableReadableStream<T>(iterable: MaybeAsyncIterable<T>): ReadableStream<T> {
    let iterator: Iterator<T, void, void> | AsyncIterator<T, void, void> | undefined;

    return new ReadableStream({
        start() {
            if (Symbol.asyncIterator in iterable) {
                iterator = iterable[Symbol.asyncIterator]();
            } else {
                iterator = iterable[Symbol.iterator]();
            }
        },

        async pull(controller) {
            if (!iterator) {
                controller.close();
                return;
            }

            try {
                let next = iterator.next();
                if (MaybePromise.is(next)) {
                    next = await next;
                }

                if (next.done) {
                    controller.close();
                    return;
                }

                controller.enqueue(next.value);
            } catch (e) {
                controller.error(e);
                return;
            }
        },

        async cancel(reason) {
            if (reason) {
                if (iterator?.throw) {
                    await iterator.throw(reason);
                    return;
                }

                if (iterator?.return) {
                    await iterator.return();
                }

                throw reason;
            }

            await iterator?.return?.();
        },
    });
}
