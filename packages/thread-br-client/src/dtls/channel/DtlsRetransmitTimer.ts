/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, Millis, Time, type Timer } from "@matter/general";

/**
 * Per-flight DTLS 1.2 retransmit timer (RFC 6347 §4.2.4).
 *
 * On `armNewFlight()` the timer is scheduled at `initialMs`. On each fire it
 * invokes `onRetransmit`, doubles the next interval (capped at `maxMs`), and
 * increments the attempt counter. After `maxRetransmits` attempts the timer
 * stops and `onGiveUp` is invoked instead. `cancel()` (e.g. when the next
 * inbound flight implicitly acknowledges the previous one) is idempotent.
 *
 * Tests use MockTime to control timer advancement deterministically.
 */
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
}

export class DtlsRetransmitTimer {
    readonly #initialMs: number;
    readonly #maxMs: number;
    readonly #maxRetransmits: number;
    readonly #onRetransmit: () => void;
    readonly #onGiveUp: () => void;

    #timer: Timer | undefined;
    #attempt = 0;
    #nextDelayMs: number;

    constructor(opts: DtlsRetransmitTimerOpts) {
        if (opts.initialMs <= 0) {
            throw new ImplementationError(`DtlsRetransmitTimer initialMs must be > 0, got ${opts.initialMs}`);
        }
        if (opts.maxMs < opts.initialMs) {
            throw new ImplementationError(
                `DtlsRetransmitTimer maxMs ${opts.maxMs} must be >= initialMs ${opts.initialMs}`,
            );
        }
        if (opts.maxRetransmits < 1) {
            throw new ImplementationError(
                `DtlsRetransmitTimer maxRetransmits must be >= 1, got ${opts.maxRetransmits}`,
            );
        }
        this.#initialMs = opts.initialMs;
        this.#maxMs = opts.maxMs;
        this.#maxRetransmits = opts.maxRetransmits;
        this.#onRetransmit = opts.onRetransmit;
        this.#onGiveUp = opts.onGiveUp;
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
        this.#timer?.stop();
        this.#timer = undefined;
    }

    isArmed(): boolean {
        return this.#timer !== undefined;
    }

    /** Visible for tests — current attempt count (0 before the first fire). */
    get attempt(): number {
        return this.#attempt;
    }

    #schedule(): void {
        const delay = this.#nextDelayMs;
        this.#timer = Time.getTimer("dtls-retransmit", Millis(delay), () => {
            this.#timer = undefined;
            this.#attempt += 1;
            if (this.#attempt > this.#maxRetransmits) {
                this.#onGiveUp();
                return;
            }
            this.#onRetransmit();
            // RFC 6347 §4.2.4 — double the next interval, capped at maxMs.
            this.#nextDelayMs = Math.min(this.#nextDelayMs * 2, this.#maxMs);
            this.#schedule();
        }).start();
    }
}
