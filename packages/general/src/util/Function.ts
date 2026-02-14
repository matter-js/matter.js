/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A base for classes that are also functions.
 */
export interface Callable<A extends unknown[], R = void> {
    (...args: A): R;
}

// oxlint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Callable<A extends unknown[], R> {
    /**
     * Create a new invocable
     */
    constructor(invoke: Callable<A, R>) {
        Object.setPrototypeOf(invoke, new.target.prototype);
        return invoke;
    }
}
