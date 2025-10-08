/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimeoutError } from "#MatterError.js";
import { Duration } from "#time/Duration.js";
import { Time, Timer } from "#time/Time.js";

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
     *
     * {@link timeout} is a convenience for adding a timeout.
     */
    export function subtask(signal: Signal | undefined, timeout?: Duration): DisposableController {
        let timer: Timer | undefined;

        if (signal && "signal" in signal) {
            signal = signal.signal;
        }

        const controller = new AbortController() as DisposableController;

        if (timeout) {
            timer = Time.getPeriodicTimer("subtask timeout", timeout, () => {
                if (controller.signal.aborted) {
                    return;
                }

                controller.abort(new TimeoutError());
            });
            timer.start();
        }

        if (signal) {
            const outerHandler = () => controller.abort(signal.reason);
            signal.addEventListener("abort", outerHandler);
            controller[Symbol.dispose] = () => {
                signal.removeEventListener("abort", outerHandler);
                timer?.stop();
            };
        } else {
            controller[Symbol.dispose] = () => {
                timer?.stop();
            };
        }

        return controller;
    }
}
