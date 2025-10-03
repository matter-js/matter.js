/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utilities for implementing abort logic.
 */
export namespace Abort {
    /**
     * An entity that may be used to signal abort of an operation.
     */
    export type Signal = AbortController | AbortSignal;

    /**
     * An abort controller that can be closed.
     */
    export interface DisposableController extends AbortController {
        [Symbol.dispose](): void;
    }

    /**
     * Determine whether a {@link Signal} is aborted.
     */
    export function is(signal: Signal | undefined) {
        if (!signal) {
            return;
        }

        if ("signal" in signal) {
            signal = signal.signal;
        }

        return signal.aborted;
    }

    /**
     * Race one or more promises with an optional abort signal.
     *
     * If the abort signal is present and signals abort, the race will end and return undefined.  It will not throw the
     * abort reason.
     */
    export function race<T>(
        signal: Signal | undefined,
        ...promises: Array<T | PromiseLike<T>>
    ): Promise<Awaited<T> | void> {
        if (signal) {
            if ("signal" in signal) {
                signal = signal.signal;
            }

            let off: () => void;
            const aborted = new Promise<void>(resolve => {
                const onabort = () => resolve();
                (signal as AbortSignal).addEventListener("abort", onabort);
                off = () => (signal as AbortSignal).removeEventListener("abort", onabort);
            });

            return Promise.race([aborted, ...promises]).finally(off!);
        }

        if (promises.length === 1) {
            return Promise.resolve(promises[0]);
        }

        return Promise.race(promises);
    }

    /**
     * Create independently abortable subtask with a new {@link AbortController} that is aborted if another controller
     * aborts.
     *
     * Closing the returned controller unregisters with the input controller.  It does not perform an abort.
     */
    export function subtask(signal: Signal | undefined): DisposableController {
        if (signal && "signal" in signal) {
            signal = signal.signal;
        }

        const controller = new AbortController() as DisposableController;

        if (signal) {
            const outerHandler = () => controller.abort();
            signal.addEventListener("abort", outerHandler);
            controller[Symbol.dispose] = () => signal.removeEventListener("abort", outerHandler);
        } else {
            controller[Symbol.dispose] = () => {};
        }

        return controller;
    }
}
