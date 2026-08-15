/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A push/pull line buffer: producers {@link push} synchronously, consumers iterate asynchronously.
 * Any number of independent iterations (via {@link follow} or `for await` directly) each replay
 * every line seen so far before tailing live until {@link close}. Lines are buffered for the
 * queue's lifetime — the replay contract precludes dropping them.
 *
 * Structurally satisfies `LogSource` (`chip/cert/cert-context.ts`) via {@link follow}.
 */
export class LineQueue implements AsyncIterable<string> {
    #lines = new Array<string>();
    #closed = false;
    #waiters = new Array<() => void>();

    push(line: string): void {
        this.#lines.push(line);
        this.#wake();
    }

    close(): void {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.#wake();
    }

    follow(): AsyncIterable<string> {
        return this.#iterate();
    }

    /** Forwards every line of `source` into the queue; resolves when `source` ends. */
    async pump(source: AsyncIterable<string>): Promise<void> {
        for await (const line of source) {
            this.push(line);
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<string> {
        return this.#iterate()[Symbol.asyncIterator]();
    }

    #wake(): void {
        const waiters = this.#waiters;
        this.#waiters = new Array<() => void>();
        for (const waiter of waiters) {
            waiter();
        }
    }

    async *#iterate(): AsyncGenerator<string> {
        let index = 0;
        for (;;) {
            while (index < this.#lines.length) {
                yield this.#lines[index++];
            }
            if (this.#closed) {
                return;
            }
            await new Promise<void>(resolve => this.#waiters.push(resolve));
        }
    }
}

// Node clamps a setTimeout delay above this to 1ms, which would busy-spin a timer/wake race
// instead of actually waiting.
const MAX_TIMEOUT_MS = 0x7fffffff;

/**
 * A cancellable timeout for racing against other async work.
 */
export function delay(ms: number): { promise: Promise<"timeout">; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout>;
    const promise = new Promise<"timeout">(resolve => {
        timer = setTimeout(() => resolve("timeout"), Math.min(ms, MAX_TIMEOUT_MS));
    });
    return { promise, cancel: () => clearTimeout(timer) };
}
