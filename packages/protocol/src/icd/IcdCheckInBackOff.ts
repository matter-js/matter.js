/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Seconds } from "@matter/general";

/**
 * Per-client ICD Check-In back-off. Consulted once per idle→active wake for each Permanent registration. Keyed by
 * `${fabricIndex}:${checkInNodeId}`.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.15.1, § 9.16.6.10
 */
export interface IcdCheckInBackOff {
    /** True when a Check-In is due for this client this wake. Advances the per-wake countdown — call exactly once per wake. */
    shouldSend(key: string): boolean;
    /** Record that a Check-In was attempted this wake (advances the schedule). */
    recordSent(key: string): void;
    /** The client interacted (became covered by an active subscription) — reset to immediate. */
    recordAnswered(key: string): void;
    /** User Active Mode Trigger — reset all clients to immediate (spec-mandatory). */
    resetAll(): void;
    /** Drop a client's state (registration removed). */
    forget(key: string): void;
}

interface BackOffState {
    sendCount: number;
    cyclesUntilNextSend: number;
}

/**
 * Default back-off: send on wake, then skip a doubling number of idle cycles (1,2,4,…) capped so the interval never
 * exceeds `maximumCheckInBackoff`. When `maximumCheckInBackoff === idleModeDuration` the cap is one cycle, i.e. no
 * back-off (a Check-In every wake).
 */
export class DoublingCheckInBackOff implements IcdCheckInBackOff {
    readonly #maxCycles: number;
    readonly #clients = new Map<string, BackOffState>();

    constructor(idleModeDuration: Duration, maximumCheckInBackoff: Duration) {
        const idleSeconds = Seconds.of(idleModeDuration);
        this.#maxCycles =
            idleSeconds > 0 ? Math.max(1, Math.floor(Seconds.of(maximumCheckInBackoff) / idleSeconds)) : 1;
    }

    #stateFor(key: string): BackOffState {
        let state = this.#clients.get(key);
        if (state === undefined) {
            state = { sendCount: 0, cyclesUntilNextSend: 0 };
            this.#clients.set(key, state);
        }
        return state;
    }

    shouldSend(key: string): boolean {
        const state = this.#stateFor(key);
        if (state.cyclesUntilNextSend <= 0) {
            return true;
        }
        state.cyclesUntilNextSend--;
        return false;
    }

    recordSent(key: string): void {
        const state = this.#stateFor(key);
        state.sendCount++;
        state.cyclesUntilNextSend = Math.min(2 ** (state.sendCount - 1), this.#maxCycles) - 1;
    }

    recordAnswered(key: string): void {
        // Dropping the state resets to immediate: a fresh entry sends on the next wake.
        this.#clients.delete(key);
    }

    resetAll(): void {
        this.#clients.clear();
    }

    forget(key: string): void {
        this.#clients.delete(key);
    }
}
