/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-flight DTLS 1.2 retransmit timer (RFC 6347 §4.2.4).
 *
 * On `armNewFlight()` the timer is scheduled at `initialMs`. On each fire it
 * invokes `onRetransmit`, doubles the next interval (capped at `maxMs`), and
 * increments the attempt counter. After `maxRetransmits` attempts the timer
 * stops and `onGiveUp` is invoked instead. `cancel()` (e.g. when the next
 * inbound flight implicitly acknowledges the previous one) is idempotent.
 *
 * Tests inject `setTimeoutImpl`/`clearTimeoutImpl` for determinism; production
 * uses Node's globals.
 */
export interface DtlsRetransmitTimerHandle {
    /** Opaque per-implementation handle (Node `Timeout`, browser number, etc.). */
    readonly _opaque: unknown;
}

export type DtlsSetTimeoutFn = (callback: () => void, ms: number) => DtlsRetransmitTimerHandle;
export type DtlsClearTimeoutFn = (handle: DtlsRetransmitTimerHandle) => void;

export interface DtlsRetransmitTimerOpts {
    /** Initial delay before the first retransmit fires. */
    initialMs: number;
    /** Cap on the doubling sequence — RFC 6347 §4.2.4 default 60_000ms. */
    maxMs: number;
    /** Maximum retransmits before invoking `onGiveUp`. */
    maxRetransmits: number;
    /** Fired each retransmit (caller re-emits the last flight). */
    onRetransmit: () => void;
    /** Fired once after `maxRetransmits` attempts have elapsed without acknowledgement. */
    onGiveUp: () => void;
    /** Override for tests. Defaults to the global `setTimeout`. */
    setTimeoutImpl?: DtlsSetTimeoutFn;
    /** Override for tests. Defaults to the global `clearTimeout`. */
    clearTimeoutImpl?: DtlsClearTimeoutFn;
}

const defaultSetTimeout: DtlsSetTimeoutFn = (cb, ms) => {
    const id = setTimeout(cb, ms);
    return { _opaque: id };
};

const defaultClearTimeout: DtlsClearTimeoutFn = handle => {
    clearTimeout(handle._opaque as ReturnType<typeof setTimeout>);
};

export class DtlsRetransmitTimer {
    readonly #initialMs: number;
    readonly #maxMs: number;
    readonly #maxRetransmits: number;
    readonly #onRetransmit: () => void;
    readonly #onGiveUp: () => void;
    readonly #setTimeoutImpl: DtlsSetTimeoutFn;
    readonly #clearTimeoutImpl: DtlsClearTimeoutFn;

    #handle: DtlsRetransmitTimerHandle | undefined;
    #attempt = 0;
    #nextDelayMs: number;

    constructor(opts: DtlsRetransmitTimerOpts) {
        if (opts.initialMs <= 0) {
            throw new Error(`DtlsRetransmitTimer initialMs must be > 0, got ${opts.initialMs}`);
        }
        if (opts.maxMs < opts.initialMs) {
            throw new Error(`DtlsRetransmitTimer maxMs ${opts.maxMs} must be >= initialMs ${opts.initialMs}`);
        }
        if (opts.maxRetransmits < 1) {
            throw new Error(`DtlsRetransmitTimer maxRetransmits must be >= 1, got ${opts.maxRetransmits}`);
        }
        this.#initialMs = opts.initialMs;
        this.#maxMs = opts.maxMs;
        this.#maxRetransmits = opts.maxRetransmits;
        this.#onRetransmit = opts.onRetransmit;
        this.#onGiveUp = opts.onGiveUp;
        this.#setTimeoutImpl = opts.setTimeoutImpl ?? defaultSetTimeout;
        this.#clearTimeoutImpl = opts.clearTimeoutImpl ?? defaultClearTimeout;
        this.#nextDelayMs = opts.initialMs;
    }

    /**
     * Arm or re-arm the timer for a freshly emitted flight, resetting the attempt
     * counter and the doubling delay back to `initialMs`.
     */
    armNewFlight(): void {
        this.cancel();
        this.#attempt = 0;
        this.#nextDelayMs = this.#initialMs;
        this.#schedule();
    }

    /** Cancel any pending timer. Safe to call when not armed. */
    cancel(): void {
        if (this.#handle !== undefined) {
            this.#clearTimeoutImpl(this.#handle);
            this.#handle = undefined;
        }
    }

    isArmed(): boolean {
        return this.#handle !== undefined;
    }

    /** Visible for tests — current attempt count (0 before the first fire). */
    get attempt(): number {
        return this.#attempt;
    }

    #schedule(): void {
        const delay = this.#nextDelayMs;
        this.#handle = this.#setTimeoutImpl(() => {
            this.#handle = undefined;
            this.#attempt += 1;
            if (this.#attempt > this.#maxRetransmits) {
                this.#onGiveUp();
                return;
            }
            this.#onRetransmit();
            // RFC 6347 §4.2.4 — double the next interval, capped at maxMs.
            this.#nextDelayMs = Math.min(this.#nextDelayMs * 2, this.#maxMs);
            this.#schedule();
        }, delay);
    }
}
