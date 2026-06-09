/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservableValue, Duration, Millis, Seconds, Time, Timer, Timespan, Timestamp } from "@matter/general";

/**
 * Per-peer wakefulness for a LIT (Long Idle Time) ICD peer.
 *
 * Tracks two sliding-window boolean signals so a controller knows when it may send and whether a peer is still
 * reachable:
 *
 *   - {@link awake} — send-now. Window length is `activeModeThreshold`. Any inbound signal re-arms it; a StayActive
 *     promise extends it; expiry clears it.
 *   - {@link available} — not-offline. Longer window of `idleModeDuration + AVAILABILITY_MARGIN`. Expiry means an
 *     expected Check-In was missed, i.e. the peer is offline.
 *
 * Invariant: `awake` implies `available` — a signal refreshes both. A non-LIT peer (`requiresAwait === false`) is
 * always awake and available with no timers.
 */
export class IcdPeerWakefulness {
    static readonly AVAILABILITY_MARGIN = Seconds(5);
    static readonly DEFAULT_SAT = Seconds(5);
    static readonly DEFAULT_IDLE = Seconds(30);

    readonly #awake = AsyncObservableValue(true);
    readonly #available = AsyncObservableValue(true);

    #requiresAwait = false;
    #activeModeThreshold = IcdPeerWakefulness.DEFAULT_SAT;
    #idleModeDuration = IcdPeerWakefulness.DEFAULT_IDLE;

    #awakeUntil = Timestamp(0);
    #availableUntil = Timestamp(0);
    #awakeTimer?: Timer;
    #availableTimer?: Timer;

    /** Emits when send-now state changes. `.value` reads the current boolean. */
    get awake() {
        return this.#awake;
    }

    /** Emits when reachability state changes. `.value` reads the current boolean. */
    get available() {
        return this.#available;
    }

    get requiresAwait() {
        return this.#requiresAwait;
    }

    set requiresAwait(value: boolean) {
        if (value === this.#requiresAwait) {
            return;
        }
        this.#requiresAwait = value;
        if (value) {
            this.#setAwake(false);
            this.#setAvailable(false);
        } else {
            this.#cancelTimers();
            this.#setAwake(true);
            this.#setAvailable(true);
        }
    }

    setTimings(timings: { activeModeThreshold?: Duration; idleModeDuration?: Duration }) {
        if (timings.activeModeThreshold !== undefined) {
            this.#activeModeThreshold = timings.activeModeThreshold;
        }
        if (timings.idleModeDuration !== undefined) {
            this.#idleModeDuration = timings.idleModeDuration;
        }
    }

    /** Record an inbound signal: re-arm both windows and mark awake + available. */
    noteSignal() {
        if (!this.#requiresAwait) {
            return;
        }
        this.#armAwake(this.#activeModeThreshold);
        this.#armAvailable(Millis(this.#idleModeDuration + IcdPeerWakefulness.AVAILABILITY_MARGIN));
        this.#setAwake(true);
        this.#setAvailable(true);
    }

    /** Extend the awake window to honor a StayActive promise without ever truncating a longer existing window. */
    noteStayActive(promised: Duration) {
        if (!this.#requiresAwait) {
            return;
        }
        // A peer promised awake until T is, by definition, available until T (awake ⇒ available).
        this.#armAwake(promised);
        this.#armAvailable(promised);
        this.#setAwake(true);
        this.#setAvailable(true);
    }

    close() {
        this.#cancelTimers();
    }

    [Symbol.dispose]() {
        this.close();
    }

    // Extend rather than truncate: keep the later of the pending expiry and now + duration.
    #armAwake(duration: Duration) {
        const candidate = Timestamp(Time.nowMs + duration);
        if (candidate <= this.#awakeUntil && this.#awakeTimer !== undefined) {
            return;
        }
        this.#awakeUntil = candidate;
        const remaining = Timespan(Time.nowMs, this.#awakeUntil).duration;
        this.#awakeTimer?.stop();
        this.#awakeTimer = Time.getTimer("icd-peer-awake", remaining, () => {
            this.#awakeTimer?.stop();
            this.#awakeTimer = undefined;
            this.#setAwake(false);
        }).start();
    }

    #armAvailable(duration: Duration) {
        const candidate = Timestamp(Time.nowMs + duration);
        if (candidate <= this.#availableUntil && this.#availableTimer !== undefined) {
            return;
        }
        this.#availableUntil = candidate;
        const remaining = Timespan(Time.nowMs, this.#availableUntil).duration;
        this.#availableTimer?.stop();
        this.#availableTimer = Time.getTimer("icd-peer-available", remaining, () => {
            this.#availableTimer?.stop();
            this.#availableTimer = undefined;
            this.#setAvailable(false);
        }).start();
    }

    #cancelTimers() {
        this.#awakeTimer?.stop();
        this.#awakeTimer = undefined;
        this.#availableTimer?.stop();
        this.#availableTimer = undefined;
        this.#awakeUntil = Timestamp(0);
        this.#availableUntil = Timestamp(0);
    }

    #setAwake(value: boolean) {
        if (this.#awake.value !== value) {
            this.#awake.emit(value);
        }
    }

    #setAvailable(value: boolean) {
        if (this.#available.value !== value) {
            this.#available.emit(value);
        }
    }
}
