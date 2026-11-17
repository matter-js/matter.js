/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The kinds of failure seen so far, so a failure that a peer can trigger with every report warns once and its repeats
 * log at debug level.  The kind of a failure is its error class, or its `typeof` for a value that is not an error.
 */
export class FailureKinds {
    #seen = new Set<unknown>();

    /**
     * Record the kind of {@link failure}.  Returns true if no failure of that kind was recorded since construction or
     * the last {@link reset}.
     */
    add(failure: unknown): boolean {
        const kind = failure instanceof Error ? failure.constructor : typeof failure;
        if (this.#seen.has(kind)) {
            return false;
        }
        this.#seen.add(kind);
        return true;
    }

    /**
     * Forget all recorded kinds, so the next failure of each kind is new again.
     */
    reset() {
        this.#seen.clear();
    }
}
