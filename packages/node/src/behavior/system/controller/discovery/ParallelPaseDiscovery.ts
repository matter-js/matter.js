/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Abort,
    CanceledError,
    causedBy,
    Diagnostic,
    Logger,
    MatterAggregateError,
    Millis,
    Seconds,
} from "@matter/general";
import { CommissioningError, PeerCommunicationError } from "@matter/protocol";
import { Discovery } from "./Discovery.js";
import { DiscoveryAggregateError, DiscoveryError } from "./DiscoveryError.js";

const logger = Logger.get("ParallelPaseDiscovery");

/**
 * Delay between PASE attempts to DIFFERENT discovered devices.  Kept short because cross-device attempts do
 * not share a responder state — this stagger only avoids a burst of simultaneous mDNS-triggered PASE starts
 * when many devices respond at once.  Per-address stagger for a single device lives in CommissioningConnection.
 */
const CROSS_DEVICE_STAGGER_DELAY = Seconds(1);

/**
 * Base class for discovery flows that run parallel PASE establishments with a first-to-win race gate.
 *
 * Subclasses override {@link onDiscovered} to launch their specific PASE-time action via
 * {@link registerAttempt}, providing:
 *  - a {@code factory} that creates the PASE attempt and accepts the {@code winOnPase} gate callback,
 *  - an {@code extractWinner} to pull the result value from the settled promise.
 *
 * Attempts are staggered: the first starts immediately, each subsequent one waits an additional
 * {@link CROSS_DEVICE_STAGGER_DELAY}.  When {@code winOnPase} is called, the internal abort signal fires,
 * which cancels any pending stagger sleeps so that no further attempts are started.
 */
export abstract class ParallelPaseDiscovery<W> extends Discovery<W> {
    #paseWon = false;
    #pending = new Set<Promise<unknown>>();
    #abort = new AbortController();
    #winner?: W;
    #winnerAttempt?: Promise<unknown>;
    #winnerError?: unknown;
    #extractWinner?: (result: unknown) => W | undefined;
    #attemptErrors = new Array<Error>();
    #attemptCount = 0;
    #startedCount = 0;

    protected get abortSignal() {
        return this.#abort.signal;
    }

    protected get paseWon() {
        return this.#paseWon;
    }

    /** Label used in the aggregate error when awaiting candidate cleanup. */
    protected abstract get cleanupLabel(): string;

    /** Error message prefix used when no winner was established. */
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
        let attempt!: Promise<R | undefined>;
        let isWinner = false;

        const winOnPase = () => {
            if (this.#paseWon) {
                return false;
            }
            this.#paseWon = true;
            isWinner = true;
            this.stop();
            this.#abort.abort();
            this.#pending.delete(attempt);
            this.#winnerAttempt = attempt;
            this.#extractWinner = extractWinner as (result: unknown) => W | undefined;
            return true;
        };

        const attemptIndex = this.#attemptCount++;
        const stagger = Millis(attemptIndex * CROSS_DEVICE_STAGGER_DELAY);

        const startFactory = () => {
            this.#startedCount++;
            return factory(winOnPase);
        };

        attempt = (
            stagger > 0
                ? Abort.sleep("PASE stagger", this.#abort.signal, stagger).then(() => {
                      if (!this.#abort.signal.aborted) {
                          return startFactory();
                      }
                  })
                : Promise.resolve(startFactory())
        )
            .catch(error => {
                if (isWinner) {
                    // Winner's error is meaningful — capture it for onComplete to rethrow
                    this.#winnerError = error;
                    return undefined;
                }
                // Loser: resolve to prevent unhandled rejection.
                // Collect the error for the final failure message unless it was a cancellation
                // triggered by our own abort (i.e. another candidate won or discovery timed out).
                if (causedBy(error, CanceledError)) {
                    logger.debug("Canceled parallel commissioning attempt:", Diagnostic.errorMessage(error));
                } else if (causedBy(error, CommissioningError, PeerCommunicationError)) {
                    this.#attemptErrors.push(error);
                    logger.debug("Failed parallel commissioning attempt:", Diagnostic.errorMessage(error));
                } else {
                    this.#attemptErrors.push(error);
                    logger.info("Unexpected error from parallel commissioning attempt:", error);
                }
                return undefined;
            })
            .finally(() => {
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
            // Await winner's full operation (e.g. commissioning).  If the winner captured an error
            // during its .catch handler, rethrow it here so the caller sees a meaningful failure.
            if (this.#winnerAttempt !== undefined) {
                const result = await this.#winnerAttempt;
                if (this.#winnerError !== undefined) {
                    throw this.#winnerError;
                }
                this.#winner = this.#extractWinner!(result);
            }
        } finally {
            // Await loser cleanup (canceled PASE sessions, etc.).  All losers resolve to undefined
            // so rejections here would indicate an unexpected bug — log but don't mask the winner error.
            await MatterAggregateError.allSettled([...this.#pending], this.cleanupLabel).catch(error => {
                logger.error("Unexpected error during parallel attempt cleanup:", error);
            });
        }

        if (this.#winner === undefined) {
            let detail: string;
            if (this.#attemptCount === 0) {
                detail = "No commissionable device was discovered";
            } else if (this.#attemptErrors.length > 0) {
                detail = `${this.failureMessage} (${this.#attemptErrors.length} of ${this.#startedCount} started attempt(s) failed, ${this.#attemptCount} discovered)`;
            } else {
                detail = `${this.failureMessage} (${this.#startedCount} attempt(s) started of ${this.#attemptCount} discovered, all canceled or timed out)`;
            }
            const message = `${this} failed: ${detail}`;
            if (this.#attemptErrors.length > 0) {
                throw new DiscoveryAggregateError(this.#attemptErrors, message);
            }
            throw new DiscoveryError(message);
        }

        return this.#winner;
    }
}
