/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError } from "@matter/general";
import { Discovery } from "./Discovery.js";
import { DiscoveryError } from "./DiscoveryError.js";

/**
 * Base class for discovery flows that run parallel PASE establishments with a first-to-win race gate.
 *
 * Subclasses override {@link onDiscovered} to launch their specific PASE-time action via
 * {@link registerAttempt}, providing:
 *  - a {@code factory} that creates the PASE attempt and accepts the {@code winOnPase} gate callback,
 *  - an {@code extractWinner} to pull the result value from the settled promise.
 */
export abstract class ParallelPaseDiscovery<W> extends Discovery<W> {
    #paseWon = false;
    #pending = new Set<Promise<unknown>>();
    #abort = new AbortController();
    #winner?: W;
    #winnerPromise?: Promise<unknown>;

    protected get abortSignal() {
        return this.#abort.signal;
    }

    protected get paseWon() {
        return this.#paseWon;
    }

    /** Label used in the aggregate error when awaiting candidate cleanup. */
    protected abstract get cleanupLabel(): string;

    /** Error message used when no winner was established. */
    protected abstract get failureMessage(): string;

    /**
     * Registers a parallel PASE attempt for the given node.
     *
     * @param factory Produces the attempt promise.  Receives a {@code winOnPase} callback that the implementation
     *   passes as the {@code continueXxx} option to the underlying PASE/commissioning call.  When invoked, it
     *   performs the race-gate logic and returns true if this attempt wins, false if another already won.
     * @param extractWinner Extracts the winner value from the settled attempt result.  Called only for the
     *   winning attempt after its promise resolves.
     */
    protected registerAttempt<R>(
        factory: (winOnPase: () => boolean) => R | PromiseLike<R>,
        extractWinner: (result: R) => W | undefined,
    ): void {
        // attempt is declared before assignment so the winOnPase closure can reference it by name.
        // The closure is only ever invoked asynchronously (after PASE establishes), well after
        // the synchronous assignment below.
        let attempt!: Promise<R>;

        const winOnPase = () => {
            if (this.#paseWon) return false;
            this.#paseWon = true;
            this.stop();
            this.#abort.abort();
            this.#pending.delete(attempt);
            this.#winnerPromise = attempt.then(result => {
                this.#winner = extractWinner(result);
            });
            return true;
        };

        attempt = Promise.resolve(factory(winOnPase)).finally(() => {
            this.#pending.delete(attempt);
        });

        this.#pending.add(attempt);
    }

    protected override async onComplete(): Promise<W> {
        if (!this.#paseWon) {
            // Discovery ended without any candidate winning PASE — cancel any remaining attempts.
            this.#abort.abort();
        }

        try {
            // Await winner's operation.  Any error here is meaningful and propagates to the caller.
            await this.#winnerPromise;
        } finally {
            // Await loser cleanup (canceled PASE sessions, etc.) and absorb errors — these are expected
            // side effects of the race and are not relevant to the caller.
            await MatterAggregateError.allSettled([...this.#pending], this.cleanupLabel).catch(() => {});
        }

        if (this.#winner === undefined) {
            throw new DiscoveryError(`${this} failed: ${this.failureMessage}`);
        }

        return this.#winner;
    }
}
