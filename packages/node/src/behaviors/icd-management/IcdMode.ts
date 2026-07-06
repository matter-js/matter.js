/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Time, Timer, Timespan, Timestamp } from "@matter/general";

export enum IcdMode {
    Idle = "idle",
    Active = "active",
}

export interface IcdModeStateOptions {
    /** Minimum active-window length after entering Active mode. @see {@link MatterSpecification.v16.Core} § 9.16.6.2 */
    activeModeDuration: Duration;
    /** Active-window extension granted per network activity. @see {@link MatterSpecification.v16.Core} § 9.16.6.3 */
    activeModeThreshold: Duration;
    /** Entered Active mode — initial power-up or an idle→active wake. The Check-In send point. */
    onActiveEntered: () => void;
    /** Active→Idle transition (device went idle). */
    onIdleEntered: () => void;
    /** Active window elapsed with no further activity: the device may now be put to sleep. */
    onMayEnterIdle: () => void;
}

/**
 * Device-side ICD idle/active mode, fully externally driven.
 *
 * matter.js nodes never truly sleep and stay reachable; this models the logical mode for spec/cert completeness,
 * controller verification, and app power hooks. It never cycles on its own: the single one-shot active-window timer
 * only signals `onMayEnterIdle`; all transitions are driven by {@link start}/{@link stop}, {@link enterIdle},
 * {@link requestActive}, and {@link noteActivity}. Distinct from the ICD SIT/LIT OperatingMode.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.15.1, § 9.16
 */
export class IcdModeState {
    readonly #activeModeDuration: Duration;
    readonly #activeModeThreshold: Duration;
    readonly #onActiveEntered: () => void;
    readonly #onIdleEntered: () => void;
    readonly #onMayEnterIdle: () => void;

    #mode = IcdMode.Idle;
    #running = false;
    #activeUntil = Timestamp(0);
    #activeTimer?: Timer;

    constructor(options: IcdModeStateOptions) {
        this.#activeModeDuration = options.activeModeDuration;
        this.#activeModeThreshold = options.activeModeThreshold;
        this.#onActiveEntered = options.onActiveEntered;
        this.#onIdleEntered = options.onIdleEntered;
        this.#onMayEnterIdle = options.onMayEnterIdle;
    }

    get mode() {
        return this.#mode;
    }

    get isActive() {
        return this.#mode === IcdMode.Active;
    }

    /** Node online: enter Active mode and begin tracking. Idempotent. */
    start() {
        if (this.#running) {
            return;
        }
        this.#running = true;
        this.#enterActive(this.#activeModeDuration);
    }

    /** Node going offline: pause; stop the active-window timer without emitting transitions. Idempotent. */
    stop() {
        this.#running = false;
        this.#activeTimer?.stop();
        this.#mode = IcdMode.Idle;
    }

    /** Record network activity: extend the active window if Active, or wake to Active if Idle (idle→active). */
    noteActivity() {
        if (!this.#running) {
            return;
        }
        if (this.#mode === IcdMode.Idle) {
            this.#enterActive(this.#activeModeThreshold);
        } else {
            this.#scheduleActiveFor(this.#activeModeThreshold);
        }
    }

    /**
     * Force Active mode for at least `duration`, waking if Idle. Returns the total remaining Active-window duration the
     * device is now committed to.
     */
    requestActive(duration: Duration): Duration {
        if (!this.#running) {
            return Millis(0);
        }
        if (this.#mode === IcdMode.Idle) {
            this.#enterActive(duration);
        } else {
            this.#scheduleActiveFor(duration);
        }
        return this.#remainingActive();
    }

    /** Force Idle mode now (unconditional — harness/app control). No-op when not running or already Idle. */
    enterIdle() {
        if (!this.#running || this.#mode === IcdMode.Idle) {
            return;
        }
        this.#activeTimer?.stop();
        this.#mode = IcdMode.Idle;
        this.#onIdleEntered();
    }

    [Symbol.dispose]() {
        this.stop();
    }

    #remainingActive(): Duration {
        return Duration.max(Millis(0), Timespan(Time.nowMs, this.#activeUntil).duration);
    }

    #enterActive(forAtLeast: Duration) {
        this.#mode = IcdMode.Active;
        this.#activeUntil = Timestamp(0); // reset so the next schedule sets the floor from now
        this.#scheduleActiveFor(Duration.max(this.#activeModeDuration, forAtLeast));
        this.#onActiveEntered();
    }

    /** Extend the active deadline to at least now + `fromNow`, never shortening it; rearm the one-shot window timer. */
    #scheduleActiveFor(fromNow: Duration) {
        const candidate = Timestamp(Time.nowMs + fromNow);
        if (candidate <= this.#activeUntil) {
            return;
        }
        this.#activeUntil = candidate;
        this.#activeTimer?.stop();
        this.#activeTimer = Time.getTimer("icd-active-window", this.#remainingActive(), () =>
            this.#onWindowExpired(),
        ).start();
    }

    #onWindowExpired() {
        this.#activeTimer?.stop();
        this.#onMayEnterIdle();
    }
}
