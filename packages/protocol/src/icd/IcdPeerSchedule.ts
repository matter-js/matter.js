/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Seconds, Timestamp } from "@matter/general";

/**
 * When a LIT (Long Idle Time) ICD peer is in Active Mode and when its next Check-In is due, derived from the peer's
 * timings and the activity the controller observed.
 *
 * The peer stays active for `activeModeDuration` after a Check-In (it sends one on entering Active Mode), for
 * `activeModeThreshold` after any other activity, and until a StayActive promise ends, whichever is last.  Afterwards
 * it idles for at most `idleModeDuration` and checks in again.  The peer is assumed not to back off its Check-Ins, as
 * the CHIP SDK's default back-off strategy does not.
 *
 * Callers pass the current time; the schedule holds no timers.
 *
 * @see {@link MatterSpecification.v161.Core} § 9.15.1.3.2.3 (Check-In cadence)
 * @see {@link MatterSpecification.v161.Core} § 9.16.6.2 (ActiveModeDuration) and § 9.16.6.3 (ActiveModeThreshold)
 */
export class IcdPeerSchedule {
    /**
     * Slack on the Check-In deadline.  A Check-In is an unreliable, unacknowledged sessionless message (no MRP, no
     * retransmission backoff), so this only covers the device's scheduling jitter.
     */
    static readonly CHECK_IN_MARGIN = Seconds(10);

    static readonly DEFAULT_TIMINGS: IcdPeerSchedule.Timings = {
        activeModeThreshold: Seconds(5),
        activeModeDuration: Millis(0),
        idleModeDuration: Seconds(30),
    };

    #timings = IcdPeerSchedule.DEFAULT_TIMINGS;
    #activeUntil?: Timestamp;

    get timings() {
        return this.#timings;
    }

    set timings(timings: IcdPeerSchedule.Timings) {
        this.#timings = timings;
    }

    /** End of the peer's estimated Active Mode, or undefined before any activity. */
    get activeUntil() {
        return this.#activeUntil;
    }

    /** Deadline of the peer's next Check-In, or undefined before any activity. */
    get nextCheckInDue(): Timestamp | undefined {
        if (this.#activeUntil === undefined) {
            return undefined;
        }
        return Timestamp(this.#activeUntil + this.idleWindow);
    }

    /** The longest the peer may idle before its next Check-In, with the Check-In margin. */
    get idleWindow(): Duration {
        return Millis(this.#timings.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN);
    }

    /** The peer sent a Check-In, entering Active Mode; its own `activeModeThreshold` overrides the configured one. */
    noteCheckIn(now: Timestamp, activeModeThreshold?: Duration) {
        const threshold = activeModeThreshold ?? this.#timings.activeModeThreshold;
        // The longer of the two, not their sum, as the CHIP SDK's ICDManager does; the specification is ambiguous
        this.#extendActive(now, Millis(Math.max(this.#timings.activeModeDuration, threshold)));
    }

    /** The peer showed activity other than a Check-In. */
    noteActive(now: Timestamp) {
        this.#extendActive(now, this.#timings.activeModeThreshold);
    }

    /** The peer promised to stay active for `promised`. */
    noteStayActive(now: Timestamp, promised: Duration) {
        this.#extendActive(now, promised);
    }

    #extendActive(now: Timestamp, activeFor: Duration) {
        const until = Timestamp(now + activeFor);
        if (this.#activeUntil === undefined || until > this.#activeUntil) {
            this.#activeUntil = until;
        }
    }
}

export namespace IcdPeerSchedule {
    /** The peer's ICD timings, from its ICD Management cluster. */
    export interface Timings {
        activeModeThreshold: Duration;
        activeModeDuration: Duration;
        idleModeDuration: Duration;
    }
}
