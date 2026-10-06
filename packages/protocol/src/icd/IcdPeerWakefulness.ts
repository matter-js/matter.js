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
 * Per-peer wakefulness for a LIT (Long Idle Time) ICD peer, for the peer's lifetime on a fabric.
 *
 * Tracks two boolean signals so a controller knows when it may send and whether a peer is still reachable:
 *
 *   - {@link awake} — send-now: the peer is in its estimated Active Mode.  Any message from the peer wakes it like a
 *     Check-In does, for `activeModeThreshold`.
 *   - {@link available} — not-offline.  While the controller holds a subscription to the peer, the subscription's own
 *     liveness decides and the peer counts as available.  Otherwise the peer's next Check-In is due after its Active
 *     Mode plus `idleModeDuration`; when that passes, {@link checkInMissed} emits.
 *
 * {@link IcdPeerSchedule} derives both deadlines; this class holds the timers and observables.  `awake` implies
 * `available`.  A LIT peer without observed activity starts asleep and unavailable.  A peer that does not require
 * awaiting (`requiresAwait === false`: not LIT) is always awake and available with no timers.
 */
export class IcdPeerWakefulness {
    readonly #awake = AsyncObservableValue(true);
    readonly #available = AsyncObservableValue(true);
    readonly #operatingModeChanged = AsyncObservableValue(false);
    readonly #checkInMissed = AsyncObservable<[]>();

    readonly #schedule = new IcdPeerSchedule();
    readonly #subscriptions = new Set<object>();

    #requiresAwait = false;
    #suspended = false;
    #closed = false;
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
     * Emits the new {@link requiresAwait} value when the peer's operating mode flips (SIT⇄LIT) at runtime.  A sustained
     * subscription recreates itself on this edge so the underlying Matter subscription is renegotiated for the new mode
     * rather than carried over.  {@link suspend} and {@link resume} do not emit it.
     */
    get operatingModeChanged() {
        return this.#operatingModeChanged;
    }

    /**
     * Emits when the next Check-In of a peer the controller is awaiting becomes overdue — never while subscribed, on a
     * mode flip, on resume, or on teardown.
     */
    get checkInMissed() {
        return this.#checkInMissed;
    }

    /**
     * Deadline of the peer's next Check-In, on the {@link Time.nowUs} clock.  Undefined when the peer needs no
     * awaiting, while the controller holds a subscription to it (the peer then sends reports instead), before any
     * activity, and once the deadline has passed.
     */
    get nextCheckInDue(): Timestamp | undefined {
        if (!this.#awaiting || this.#subscriptions.size > 0) {
            return undefined;
        }
        const due = this.#schedule.nextCheckInDue;
        if (due === undefined || due <= Time.nowUs) {
            return undefined;
        }
        return due;
    }

    /**
     * How long the controller waits by default for the peer to wake: until {@link nextCheckInDue}, but at least the
     * longest the peer may idle.
     */
    get nextCheckInWithin(): Duration {
        const idle = this.#schedule.idleWindow;
        const due = this.nextCheckInDue;
        if (due === undefined) {
            return idle;
        }
        return Millis(Math.max(Timespan(Time.nowUs, due).duration, idle));
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
            this.#refresh(false);
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
        this.#schedule.noteCheckIn(Time.nowUs, activeModeThreshold);
        this.#refresh();
    }

    /** The peer is active: a message from it arrived, or it answered the controller. */
    noteActive() {
        this.#schedule.noteActive(Time.nowUs);
        this.#refresh();
    }

    /** The peer promised to stay active for `promised`. */
    noteStayActive(promised: Duration) {
        this.#schedule.noteStayActive(Time.nowUs, promised);
        this.#refresh();
    }

    /**
     * Register a subscription the controller holds to the peer.  While any is held, the peer reports instead of
     * sending Check-Ins, so the subscription's own liveness decides availability.
     */
    holdSubscription(): Disposable {
        const subscription = {};
        this.#subscriptions.add(subscription);
        this.#refresh();
        return {
            [Symbol.dispose]: () => {
                if (this.#subscriptions.delete(subscription)) {
                    this.#refresh();
                }
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
        this.#refresh(false);
    }

    /** Suspend for good; later calls cannot arm timers again. */
    close() {
        this.#closed = true;
        this.#subscriptions.clear();
        this.suspend();
    }

    [Symbol.dispose]() {
        this.close();
    }

    get #awaiting() {
        return this.#requiresAwait && !this.#suspended;
    }

    /**
     * Rearm the timers from the schedule.  `reportMissed` is false when awaiting starts (mode flip, resume): a deadline
     * that passed while the peer was not awaited makes it unavailable without counting as a missed Check-In.
     */
    #refresh(reportMissed = true) {
        if (!this.#awaiting) {
            return;
        }

        const now = Time.nowUs;
        const activeUntil = this.#schedule.activeUntil;
        const due = this.#subscriptions.size > 0 ? undefined : this.#schedule.nextCheckInDue;
        this.#awakeTimer = this.#rearm(this.#awakeTimer, "icd-peer-awake", activeUntil, now, () =>
            this.#setAwake(false),
        );
        this.#availableTimer = this.#rearm(this.#availableTimer, "icd-peer-available", due, now, () => {
            this.#setAvailable(false);
            this.#checkInMissed.emit();
        });
        this.#setAwake(activeUntil !== undefined && activeUntil > now);
        const available = this.#subscriptions.size > 0 || (due !== undefined && due > now);
        // A deadline that passed while a subscription was held, or that new timings moved into the past, is missed now
        const missed = reportMissed && !available && due !== undefined && this.#available.value;
        this.#setAvailable(available);
        if (missed) {
            this.#checkInMissed.emit();
        }
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
