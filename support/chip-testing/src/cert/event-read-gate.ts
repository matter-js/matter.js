/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventReadEntry } from "@matter/testing";

/** An event observation as {@link EventReadGate} sees it. */
export interface GatedObservation<P> {
    readonly peer: P;
    /** What arrived while a read of {@link peer}'s events was running. */
    readonly held: EventReadEntry[];
    /** Hands on what the gate has attributed to a subscription. */
    release(entries: EventReadEntry[]): void;
}

/**
 * Keeps the events a read brings in away from event observations, which are about what a subscription
 * delivered.
 *
 * `ClientStructure` broadcasts every event a read returns through `ChangeNotificationService` exactly as it
 * does a subscription's, and does not deduplicate, so an event both deliver is broadcast twice and the two
 * broadcasts look alike. A read run through {@link reading} has broadcast its events before it returns. So
 * an observation holds what it receives while a read of its peer runs, and the read removes one held entry
 * per event it returned; what remains came from a subscription, and is released once no read of the peer
 * is running.
 *
 * Not covered: a `subscribeEvents` subscription's reports, which are subscription deliveries too, and an
 * event `ClientStructure` delayed to the end of an interaction that a concurrent interaction then flushes
 * after the read returned (its delayed events are one list shared by all interactions).
 */
export class EventReadGate<P> {
    readonly #running = new Map<P, number>();
    readonly #observations = new Set<GatedObservation<P>>();

    attach(observation: GatedObservation<P>) {
        this.#observations.add(observation);
        return () => this.#observations.delete(observation);
    }

    admit(observation: GatedObservation<P>, entry: EventReadEntry) {
        if (this.#running.has(observation.peer)) {
            observation.held.push(entry);
        } else {
            observation.release([entry]);
        }
    }

    /** Runs `read`, which collects the events it reads into `returned`. */
    async reading(peer: P, returned: ReadonlyArray<{ readonly number: bigint }>, read: () => Promise<void>) {
        this.#running.set(peer, (this.#running.get(peer) ?? 0) + 1);
        try {
            await read();
        } finally {
            const remaining = (this.#running.get(peer) ?? 1) - 1;
            if (remaining > 0) {
                this.#running.set(peer, remaining);
            } else {
                this.#running.delete(peer);
            }
            for (const observation of this.#observations) {
                if (observation.peer !== peer) {
                    continue;
                }
                for (const { number } of returned) {
                    const index = observation.held.findIndex(({ eventNumber }) => eventNumber === number);
                    if (index !== -1) {
                        observation.held.splice(index, 1);
                    }
                }
                if (remaining === 0) {
                    observation.release(observation.held.splice(0));
                }
            }
        }
    }

    close() {
        this.#observations.clear();
        this.#running.clear();
    }
}
