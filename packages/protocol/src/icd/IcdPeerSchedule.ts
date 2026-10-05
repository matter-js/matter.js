/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Seconds, Timestamp } from "@matter/general";

/**
 * When a LIT (Long Idle Time) ICD peer is in Active Mode and by when it must next signal, derived from the peer's
 * timings and the activity the controller observed.
 *
 * The peer stays active for `activeModeDuration` after a Check-In (it sends one on entering Active Mode), for
 * `activeModeThreshold` after any other activity, and until a StayActive promise ends, whichever is last.  Afterwards it
 * idles for at most `idleModeDuration`, then checks in again — or, when the controller did not interact with it since
 * its last Check-In, after up to `maximumCheckInBackoff`.  A subscribed peer reports instead, at the latest when the
 * subscription's liveness timeout ends.
 *
 * Callers pass the current time; the schedule holds no timers.
 *
 * @see {@link MatterSpecification.v161.Core} § 9.15.1.3.2.3 (Check-In cadence and back-off)
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
    #lastActivity?: Timestamp;
    #sentSinceCheckIn = false;
    #interacted = false;

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

    /** The peer sent a Check-In, entering Active Mode; its own `activeModeThreshold` overrides the configured one. */
    noteCheckIn(now: Timestamp, activeModeThreshold?: Duration) {
        this.#sentSinceCheckIn = false;
        this.#interacted = false;
        const threshold = activeModeThreshold ?? this.#timings.activeModeThreshold;
        // The longer of the two, not their sum, as the CHIP SDK's ICDManager does; the specification is ambiguous
        this.#noteActivity(now, Millis(Math.max(this.#timings.activeModeDuration, threshold)));
    }

    /** The peer showed activity other than a Check-In.  After a message the controller sent, this is an interaction. */
    noteActive(now: Timestamp) {
        if (this.#sentSinceCheckIn) {
            this.#interacted = true;
        }
        this.#noteActivity(now, this.#timings.activeModeThreshold);
    }

    /** The peer promised to stay active for `promised`. */
    noteStayActive(now: Timestamp, promised: Duration) {
        this.#extendActive(now, promised);
    }

    /** The controller sent the peer a message. */
    noteSent() {
        this.#sentSinceCheckIn = true;
    }

    /**
     * Deadline for the peer's next signal, or undefined before any activity.  Pass the liveness timeout of the longest
     * subscription the controller holds to the peer; without one, the deadline is the next Check-In.  Any activity
     * restarts the report deadline, so a missed report may be noticed up to one timeout late, never early.
     */
    nextSignalDue(reportTimeout?: Duration): Timestamp | undefined {
        if (this.#activeUntil === undefined || this.#lastActivity === undefined) {
            return undefined;
        }
        if (reportTimeout !== undefined) {
            return Timestamp(Math.max(this.#activeUntil, this.#lastActivity + reportTimeout));
        }
        return Timestamp(this.#activeUntil + this.longestIdle + IcdPeerSchedule.CHECK_IN_MARGIN);
    }

    /**
     * The longest the peer may idle before its next Check-In: `idleModeDuration`, or `maximumCheckInBackoff` when the
     * controller did not interact with the peer since its last Check-In.
     */
    get longestIdle(): Duration {
        const { idleModeDuration, maximumCheckInBackoff } = this.#timings;
        if (!this.#interacted && maximumCheckInBackoff !== undefined && maximumCheckInBackoff > idleModeDuration) {
            return maximumCheckInBackoff;
        }
        return idleModeDuration;
    }

    #noteActivity(now: Timestamp, activeFor: Duration) {
        this.#lastActivity = now;
        this.#extendActive(now, activeFor);
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
        maximumCheckInBackoff?: Duration;
    }
}
