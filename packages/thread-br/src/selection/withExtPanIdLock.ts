/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";

/**
 * Per-extPanId FIFO mutex for diagnostic flows.
 *
 * Two callers targeting the same Thread network (same extPanId) run sequentially;
 * callers targeting different networks run concurrently. The MeshCoP commissioner
 * petition is single-session per BR, so serialising same-network access prevents
 * petition collisions when the controller fans out queries.
 */
export class ExtPanIdLockManager {
    readonly #queues = new Map<string, Promise<unknown>>();

    /**
     * Run `fn` with mutual exclusion against any other invocation for the same `extPanId`.
     * Errors thrown by `fn` propagate to the caller but never poison the queue —
     * the next caller for the same key still runs.
     */
    withLock<T>(extPanId: Uint8Array, fn: () => Promise<T>): Promise<T> {
        const key = Bytes.toHex(extPanId);
        const previous = this.#queues.get(key) ?? Promise.resolve();
        const result = previous.then(() => fn());
        const chained: Promise<unknown> = result
            .catch(() => undefined)
            .finally(() => {
                // Only clear when this promise is still the tail — a later call may have already chained.
                if (this.#queues.get(key) === chained) {
                    this.#queues.delete(key);
                }
            });
        this.#queues.set(key, chained);
        return result;
    }
}
