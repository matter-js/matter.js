/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Logger, Mutex, Seconds, Time } from "@matter/general";

const logger = Logger.get("LifecycleMutex");

/**
 * Serializes the lifecycle operations of a node and its endpoints.
 *
 * Code that runs while the mutex is held, such as a reset handler or the initialization or close of a behavior, must
 * not await an operation that waits for the same mutex: the two wait for each other forever.  The mutex cannot tell
 * such a call from a call made elsewhere while the mutex is held, so it does not refuse it.  Instead it logs a warning
 * that names both operations once an operation has waited {@link LifecycleMutex.STALL_WARNING}.
 *
 * @internal
 */
export class LifecycleMutex {
    #mutex: Mutex;
    #holder?: string;

    constructor(owner: {}) {
        this.#mutex = new Mutex(owner);
    }

    /**
     * Run {@link step} as {@link operation} while holding the mutex.  The step is queued before this method returns.
     *
     * @param operation describes the operation in the warning, for example "closing node0.part0"
     */
    hold<T>(operation: string, step: () => Promise<T>): Promise<T> {
        const stalled = stallTimer(operation, () => this.#holder ?? "another lifecycle operation");
        return this.#mutex.produce(async () => {
            stalled.stop();
            this.#holder = operation;
            try {
                return await step();
            } finally {
                this.#holder = undefined;
            }
        });
    }
}

export namespace LifecycleMutex {
    /**
     * How long an operation waits before a warning is logged.
     */
    export const STALL_WARNING = Seconds(10);
}

/**
 * Await {@link promise}, the lifecycle operation in progress that {@link awaited} names, with the warning of
 * {@link LifecycleMutex}.  {@link operation} names the caller.
 *
 * @internal
 */
export async function awaitLifecycleOperation<T>(operation: string, awaited: string, promise: PromiseLike<T>) {
    const stalled = stallTimer(operation, () => awaited);
    try {
        return await promise;
    } finally {
        stalled.stop();
    }
}

function stallTimer(operation: string, holder: () => string) {
    return Time.getTimer(`Lifecycle mutex wait: ${operation}`, LifecycleMutex.STALL_WARNING, () => {
        const awaited = holder();
        logger.warn(
            `${operation} has waited ${Duration.format(LifecycleMutex.STALL_WARNING)} for ${awaited};`,
            `possible deadlock: if code running inside ${awaited} awaits ${operation}, neither finishes`,
        );
    }).start();
}
