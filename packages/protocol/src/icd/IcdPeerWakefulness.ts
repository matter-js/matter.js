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
    Time,
    Timer,
    Timespan,
    Timestamp,
} from "@matter/general";
import { IcdPeerSchedule } from "./IcdPeerSchedule.js";

/**
 * Per-peer wakefulness for a LIT (Long Idle Time) ICD peer, for the peer's whole lifetime on a fabric.
 *
 * Tracks two boolean signals so a controller knows when it may send and whether a peer is still reachable:
 *
 *   - {@link awake} — send-now: the peer is in its estimated Active Mode.
 *   - {@link available} — not-offline: the peer's next Check-In (or report, while subscribed) is not yet overdue.
 *     When an armed deadline passes, {@link checkInMissed} emits.
 *
 * {@link IcdPeerSchedule} derives both deadlines; this class holds the timers and observables.  `awake` implies
 * `available`.  A peer that does not require awaiting (`requiresAwait === false`: non-LIT or not registered) is always
 * awake and available with no timers.
 */
export class IcdPeerWakefulness {
    readonly #awake = AsyncObservableValue(true);
    readonly #available = AsyncObservableValue(true);
    readonly #operatingModeChanged = AsyncObservableValue(false);
    readonly #checkInMissed = AsyncObservable<[]>();

    readonly #schedule = new IcdPeerSchedule();
    readonly #reportCadences = new Set<{ timeout: Duration }>();
    #releasedReportDue?: Timestamp;

    #requiresAwait = false;
    #suspended = false;
    #closed = false;
    #nextSignalDue?: Timestamp;
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

    /**
     * Emits the new {@link requiresAwait} value when the peer's operating mode flips (SIT⇄LIT) or its registration
     * starts or ends.  A sustained subscription recreates itself on this edge so the underlying Matter subscription is
     * renegotiated for the new mode rather than carried over.
     */
    get operatingModeChanged() {
        return this.#operatingModeChanged;
    }

    /** Emits only when the peer's next signal is overdue — never on a mode flip or teardown. */
    get checkInMissed() {
        return this.#checkInMissed;
    }

    /** Deadline for the peer's next Check-In or report, or undefined when the peer needs no awaiting or has no baseline. */
    get nextSignalDue(): Timestamp | undefined {
        const due = this.#nextSignalDue;
        if (!this.#requiresAwait || this.#suspended || due === undefined || due <= Time.nowMs) {
            return undefined;
        }
        return due;
    }

    /**
     * The longest the controller waits for the peer's next signal: until {@link nextSignalDue}, but at least the longest
     * the peer may idle.
     */
    get nextSignalWithin(): Duration {
        const idle = Millis(this.#schedule.longestIdle + IcdPeerSchedule.CHECK_IN_MARGIN);
        const due = this.nextSignalDue;
        if (due === undefined) {
            return idle;
        }
        return Millis(Math.max(Timespan(Time.nowMs, due).duration, idle));
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
            this.#refresh();
        } else {
            this.#cancelTimers();
            // Force-emit (not the change-guarded setter): a consumer parked on the awake/available edge must resume
            // when the peer becomes always-awake, even if the value was already true.
            this.#awake.emit(true);
            this.#available.emit(true);
        }
        this.#operatingModeChanged.emit(value);
    }

    /** Replace the peer's timings. */
    setTimings(timings: IcdPeerSchedule.Timings) {
        this.#schedule.timings = timings;
        this.#refresh();
    }

    /** The peer sent a Check-In, entering Active Mode, with its current `activeModeThreshold`. */
    noteCheckIn(activeModeThreshold?: Duration) {
        this.#releasedReportDue = undefined;
        this.#schedule.noteCheckIn(Time.nowMs, activeModeThreshold);
        this.#refresh();
    }

    /** The peer is active: a message from it arrived, or a session with it was just established. */
    noteActive() {
        this.#releasedReportDue = undefined;
        this.#schedule.noteActive(Time.nowMs);
        this.#refresh();
    }

    /** The peer promised to stay active for `promised`. */
    noteStayActive(promised: Duration) {
        this.#schedule.noteStayActive(Time.nowMs, promised);
        this.#refresh();
    }

    /** The controller sent the peer a message. */
    noteSent() {
        this.#schedule.noteSent();
    }

    /**
     * Register a subscription to the peer with its liveness `timeout`.  While held, the peer suppresses Check-Ins and
     * reports instead, so the next signal is due when the longest held subscription would time out.  Releasing keeps
     * that deadline until the peer shows activity again, so a report already on its way still counts.
     */
    reportCadence(timeout: Duration): Disposable {
        const cadence = { timeout };
        this.#reportCadences.add(cadence);
        this.#refresh();
        return {
            [Symbol.dispose]: () => {
                this.#reportCadences.delete(cadence);
                const due = this.#nextSignalDue;
                if (due !== undefined && (this.#releasedReportDue === undefined || due > this.#releasedReportDue)) {
                    this.#releasedReportDue = due;
                }
                this.#refresh();
            },
        };
    }

    /**
     * Stop awaiting the peer, for example while it is not registered: timers stop and consumers parked on the
     * awake/available edge are released.  The observed activity is kept for {@link resume}.
     */
    suspend() {
        this.#suspended = true;
        this.#cancelTimers();
        // Force-emit: a parked consumer must resume even if the value was already true.
        this.#awake.emit(true);
        this.#available.emit(true);
    }

    /** Await the peer again after {@link suspend}. */
    resume() {
        if (!this.#suspended || this.#closed) {
            return;
        }
        this.#suspended = false;
        this.#refresh();
    }

    /** Suspend for good; later calls cannot arm timers again. */
    close() {
        this.#closed = true;
        this.#reportCadences.clear();
        this.suspend();
    }

    [Symbol.dispose]() {
        this.close();
    }

    get #reportTimeout(): Duration | undefined {
        let longest: Duration | undefined;
        for (const { timeout } of this.#reportCadences) {
            if (longest === undefined || timeout > longest) {
                longest = timeout;
            }
        }
        return longest;
    }

    #refresh() {
        let due = this.#schedule.nextSignalDue(this.#reportTimeout);
        if (due !== undefined && this.#releasedReportDue !== undefined && this.#releasedReportDue > due) {
            due = this.#releasedReportDue;
        }
        this.#nextSignalDue = due;
        if (!this.#requiresAwait || this.#suspended) {
            return;
        }

        const now = Time.nowMs;
        const activeUntil = this.#schedule.activeUntil;
        this.#awakeTimer = this.#rearm(this.#awakeTimer, "icd-peer-awake", activeUntil, now, () =>
            this.#setAwake(false),
        );
        this.#availableTimer = this.#rearm(this.#availableTimer, "icd-peer-available", due, now, () => {
            this.#setAvailable(false);
            this.#checkInMissed.emit();
        });
        this.#setAwake(activeUntil !== undefined && activeUntil > now);
        this.#setAvailable(due !== undefined && due > now);
    }

    #rearm(timer: Timer | undefined, name: string, at: Timestamp | undefined, now: Timestamp, expired: () => void) {
        timer?.stop();
        if (at === undefined || at <= now) {
            return undefined;
        }
        return Time.getTimer(name, Timespan(now, at).duration, expired).start();
    }

    #cancelTimers() {
        this.#awakeTimer?.stop();
        this.#awakeTimer = undefined;
        this.#availableTimer?.stop();
        this.#availableTimer = undefined;
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
