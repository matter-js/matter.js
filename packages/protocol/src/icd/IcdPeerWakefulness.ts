/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AsyncObservable,
    AsyncObservableValue,
    Duration,
    Millis,
    Seconds,
    Time,
    Timer,
    Timespan,
    Timestamp,
} from "@matter/general";

/**
 * Per-peer wakefulness for a LIT (Long Idle Time) ICD peer.
 *
 * Tracks two sliding-window boolean signals so a controller knows when it may send and whether a peer is still
 * reachable:
 *
 *   - {@link awake} — send-now. Window length is `activeModeThreshold`. Any inbound signal re-arms it; a StayActive
 *     promise extends it; expiry clears it.
 *   - {@link available} — not-offline. Longer window whose length depends on how the peer currently signals:
 *     unsubscribed it is `idleModeDuration + CHECK_IN_MARGIN` — Check-Ins are unreliable (sessionless, unacknowledged,
 *     no MRP backoff), so only device scheduling jitter needs slack. Subscribed the peer suppresses Check-Ins and
 *     re-arms this window via reports, which are reliable (MRP) and can arrive as late as the subscription's own
 *     liveness timeout, so the window becomes `reportInterval + reportMargin` (injected via {@link setTimings} to
 *     mirror that timeout). Expiry means an expected Check-In (or report) was missed, i.e. the peer is offline.
 *
 * Invariant: `awake` implies `available` — a signal refreshes both. A non-LIT peer (`requiresAwait === false`) is
 * always awake and available with no timers.
 */
export class IcdPeerWakefulness {
    /**
     * Slack added to the Check-In cadence before the availability window lapses. A Check-In is an unreliable,
     * unacknowledged sessionless message (no MRP, no retransmission backoff), so this only covers the device's
     * scheduling jitter — a small fixed value, not an MRP round-trip.
     */
    static readonly CHECK_IN_MARGIN = Seconds(10);
    static readonly DEFAULT_SAT = Seconds(5);
    static readonly DEFAULT_IDLE = Seconds(30);

    readonly #awake = AsyncObservableValue(true);
    readonly #available = AsyncObservableValue(true);
    readonly #operatingModeChanged = AsyncObservableValue(false);
    readonly #checkInMissed = AsyncObservable<[]>();

    #requiresAwait = false;
    #activeModeThreshold = IcdPeerWakefulness.DEFAULT_SAT;
    #idleModeDuration = IcdPeerWakefulness.DEFAULT_IDLE;
    #reportMargin?: Duration;
    #activeReportInterval?: Duration;

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

    /** Deadline by which the next Check-In is expected, or undefined when the peer needs no awaiting (non-LIT / no baseline). */
    get availableUntil(): Timestamp | undefined {
        return this.#requiresAwait && this.#availableUntil > 0 ? this.#availableUntil : undefined;
    }

    /**
     * Emits the new {@link requiresAwait} value when the peer's operating mode flips (SIT⇄LIT) at runtime. A
     * sustained subscription recreates itself on this edge so the underlying Matter subscription is renegotiated for
     * the new mode rather than carried over.
     */
    get operatingModeChanged() {
        return this.#operatingModeChanged;
    }

    /** Emits only when an armed availability window lapses — a missed Check-In, never a mode flip or teardown. */
    get checkInMissed() {
        return this.#checkInMissed;
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
            // Force-emit (not the change-guarded setter): a consumer parked on the awake/available edge must resume
            // when the peer becomes always-awake, even if the value was already true.
            this.#awake.emit(true);
            this.#available.emit(true);
        }
        this.#operatingModeChanged.emit(value);
    }

    setTimings(timings: { activeModeThreshold?: Duration; idleModeDuration?: Duration; reportMargin?: Duration }) {
        if (timings.activeModeThreshold !== undefined) {
            this.#activeModeThreshold = timings.activeModeThreshold;
        }
        if (timings.idleModeDuration !== undefined) {
            this.#idleModeDuration = timings.idleModeDuration;
        }
        if (timings.reportMargin !== undefined) {
            this.#reportMargin = timings.reportMargin;
        }
    }

    /**
     * Inform the availability window of the active subscription's negotiated report cadence (its `maxInterval`), or
     * pass `undefined` when no subscription is held so the window reverts to the Check-In cadence. While subscribed the
     * peer suppresses Check-Ins and re-arms availability via reports instead; those are reliable (MRP), so the window
     * is sized to mirror the subscription's own liveness timeout (see {@link setTimings} `reportMargin`). A running
     * window is extended (never truncated) so a report arriving as late as the mirrored timeout does not lapse it;
     * clearing leaves the running window to expire on its own so a genuine missed report still fires
     * {@link checkInMissed}.
     */
    setActiveReportInterval(interval: Duration | undefined) {
        if (interval === this.#activeReportInterval) {
            return;
        }
        this.#activeReportInterval = interval;
        if (this.#requiresAwait && interval !== undefined && this.#availableTimer !== undefined) {
            this.#armAvailable(this.#availabilityWindow());
        }
    }

    /** Record an inbound signal: re-arm both windows and mark awake + available. */
    noteSignal() {
        if (!this.#requiresAwait) {
            return;
        }
        this.#armAwake(this.#activeModeThreshold);
        this.#armAvailable(this.#availabilityWindow());
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
        // Release any consumer parked on the awake/available edge (a sustained subscription or an interaction hold)
        // when the peer entry is torn down, so it re-evaluates the live wakefulness instead of stranding on signals
        // that will never re-fire.
        this.#awake.emit(true);
        this.#available.emit(true);
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

    #availabilityWindow(): Duration {
        // Subscribed: reports are reliable (MRP, retransmitted) and can arrive as late as the subscription's own
        // liveness timeout (reportInterval + 2×maxPeerResponseTime). Mirror that via the injected reportMargin so
        // availability lapses in step with the subscription, never before it (which would escalate a still-live sub).
        if (this.#activeReportInterval !== undefined) {
            return Millis(this.#activeReportInterval + (this.#reportMargin ?? IcdPeerWakefulness.CHECK_IN_MARGIN));
        }
        // Unsubscribed: the peer signals via unreliable, unacknowledged Check-Ins (no MRP backoff to accommodate), so
        // a small fixed slack for device scheduling jitter is enough.
        return Millis(this.#idleModeDuration + IcdPeerWakefulness.CHECK_IN_MARGIN);
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
            // Clear the deadline so availableUntil reports "no Check-In expected" until the next signal re-arms it,
            // rather than a stale past timestamp.
            this.#availableUntil = Timestamp(0);
            this.#setAvailable(false);
            this.#checkInMissed.emit();
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
