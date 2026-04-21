/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { PairRetransmissionLimitReachedError } from "#peer/CommissioningError.js";
import { NodeSession } from "#session/NodeSession.js";
import {
    Abort,
    asError,
    causedBy,
    Duration,
    Logger,
    MatterAggregateError,
    Millis,
    NetworkError,
    NoResponseTimeoutError,
    Seconds,
    ServerAddress,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { CommissioningConnectionAttempt, CommissioningConnectionPool } from "./CommissioningConnectionPool.js";
import { TransientPeerCommunicationError } from "./PeerCommunicationError.js";

const logger = Logger.get("CommissioningConnection");

// Delay between a consecutive PASE attempt starts for addresses of the same device.  The CHIP SDK
// responder binds its singleton PASESession to the first incoming PBKDFParamRequest exchange; concurrent
// requests on other exchanges are rejected and clear the in-progress PASE state.  Staggering avoids that
// race when a single device exposes multiple addresses (e.g. IPv6 ULA + link-local + IPv4).  The first
// attempt fires immediately; each subsequent attempt waits one additional slot, cancelable when a winner
// is established.  Paired with the shorter cross-device stagger in ParallelPaseDiscovery.
const PER_ADDRESS_STAGGER_DELAY = Seconds(5);

/**
 * Attempts PASE establishments in parallel across all provided device candidates, returning the first successful
 * session.
 *
 * All candidates come from {@link CommissioningConnection.Options.devices}.  The first candidate launches
 * immediately; subsequent candidates are staggered by {@link PER_ADDRESS_STAGGER_DELAY} to avoid overwhelming a
 * device that exposes multiple addresses (the CHIP responder cannot serialise concurrent
 * PBKDFParamRequests).  This is used when addresses are already known (e.g. from a prior mDNS discovery or
 * a pre-configured address list).
 *
 * A PASE attempt is launched for each (device, address) candidate, so a single device may have multiple concurrent
 * attempts if it was discovered at multiple addresses.  If an attempt fails with a credential error the device is
 * permanently dropped.  If it fails with a transient network/timeout error the remaining addresses for that device
 * are still in-flight.  The process completes when one session is established, all candidates are exhausted, or the
 * overall timeout fires.
 *
 * When the first PASE session is established the abort signal passed to
 * {@link CommissioningConnection.Options.establishSession} fires on all remaining in-flight attempts, allowing
 * them to cancel cleanly (e.g. by sending an InvalidParam status to the device to prevent a 60-second pairing
 * lockout).
 */
export async function CommissioningConnection(
    options: CommissioningConnection.Options,
): Promise<CommissioningConnection.Result> {
    using abort = new Abort({ timeout: options.timeout, abort: options.externalAbort });
    const pool = new CommissioningConnectionPool(options.devices);
    const staggerDelay = options.staggerDelay ?? PER_ADDRESS_STAGGER_DELAY;
    let lastError: Error | undefined;
    let lastNonRetryableError: Error | undefined;

    // Deduplicates in-flight attempts by attemptKey (device+address).
    const inFlight = new Set<string>();

    // All outstanding PASE attempt promises.  Each resolves to the winning session or null on failure.
    const pending = new Set<Promise<CommissioningConnection.Result | null>>();

    // Per-device AbortControllers: fired when a PASE win or credential failure on one address of a device
    // should cancel all remaining in-flight addresses for that same device immediately.
    const deviceAborts = new Map<string, AbortController>();

    const getDeviceAbort = (deviceKey: string): AbortController => {
        let ac = deviceAborts.get(deviceKey);
        if (ac === undefined) {
            ac = new AbortController();
            deviceAborts.set(deviceKey, ac);
        }
        return ac;
    };

    let winner: CommissioningConnection.Result | undefined;
    let launchedCount = 0;

    const launchAttempt = (candidate: CommissioningConnectionAttempt) => {
        if (inFlight.has(candidate.attemptKey)) return;
        inFlight.add(candidate.attemptKey);

        // Compose global + per-device abort so either can cancel this attempt.
        const deviceAc = getDeviceAbort(candidate.deviceKey);
        const signal = AbortSignal.any([abort.signal, deviceAc.signal]);

        // Stagger consecutive attempts so the CHIP SDK responder isn't hit with concurrent
        // PBKDFParamRequests it cannot serialise.  First attempt fires immediately; each subsequent
        // one waits staggerDelay * its launch index.  The shared abort signal cancels pending
        // sleeps when a winner is established (or the overall timeout fires).
        const slot = launchedCount++;
        const stagger = Millis(slot * staggerDelay);

        const startSession = (): Promise<NodeSession | null> => {
            // Re-check race outcomes after the stagger sleep — winner may have been chosen, or this
            // device's other address may have failed credential check.
            if (winner !== undefined || signal.aborted) {
                return Promise.resolve(null);
            }
            return options.establishSession(candidate.address, candidate.device, signal);
        };

        const sessionPromise: Promise<NodeSession | null> =
            stagger > 0 ? Abort.sleep("PASE stagger", signal, stagger).then(startSession) : startSession();

        const p: Promise<CommissioningConnection.Result | null> = sessionPromise
            .then(session => {
                if (session === null) {
                    return null;
                }
                if (winner !== undefined || abort.aborted) {
                    // We lost the overall race — close this session to avoid leaking a PASE channel.
                    session
                        .initiateForceClose({ cause: asError(abort.reason ?? new Error("commissioning race lost")) })
                        .catch(e => {
                            logger.warn("Error closing losing PASE session:", asError(e));
                        });
                    return null;
                }
                winner = { session, discoveryData: candidate.device };
                // Cancel all other in-flight attempts (sends InvalidParam to prevent 60-second device lockout).
                abort.abort();
                return winner;
            })
            .catch(error => {
                // Skip error tracking if this attempt was cancelled intentionally (global or per-device abort).
                if (!abort.aborted && !deviceAc.signal.aborted) {
                    const asErr = asError(error);
                    if (causedBy(asErr, UnexpectedDataError)) {
                        // Wrong passcode — all addresses of this device will fail identically; cancel them now.
                        logger.info(`Dropping device ${candidate.device.deviceIdentifier} due to invalid credentials`);
                        lastNonRetryableError = asErr;
                        deviceAc.abort();
                        pool.markInvalidCredentials(candidate.deviceKey);
                    } else if (causedBy(asErr, NoResponseTimeoutError, TransientPeerCommunicationError, NetworkError)) {
                        lastError = asErr;
                        logger.warn(
                            `Address ${ServerAddress.urlFor(candidate.address)} unreachable for ${candidate.device.deviceIdentifier}`,
                        );
                    } else {
                        // Non-retryable error — preserve original type for caller.
                        abort.abort();
                        lastNonRetryableError = asErr;
                    }
                }
                return null;
            })
            .finally(() => {
                pending.delete(p);
                inFlight.delete(candidate.attemptKey);
            });

        pending.add(p);
    };

    for (const candidate of pool.availableCandidates(inFlight)) {
        launchAttempt(candidate);
    }

    try {
        // Drain until a winner is picked or the outer abort fires; waiting for each attempt (including those
        // still sleeping in the per-address stagger) to actually run, rather than short-circuiting on the first
        // failure.
        while (pending.size > 0 && winner === undefined && !abort.aborted) {
            await abort.race(...pending);
        }

        // Allow losers to finish sending InvalidParam / closing sessions.  Each attempt resolves to null, so
        // allSettled never rejects in practice; the .catch guards against a future refactor breaking that.
        await MatterAggregateError.allSettled([...pending]).catch(() => {});

        if (winner !== undefined) {
            return winner;
        }
        if (lastNonRetryableError !== undefined) {
            throw lastNonRetryableError;
        }
        if (abort.aborted && lastError === undefined) {
            // External cancellation propagates as-is; our own TimeoutError maps to PairRetransmissionLimitReachedError.
            const reason = abort.reason;
            if (reason !== undefined && !(reason instanceof TimeoutError)) {
                throw reason;
            }
            throw new PairRetransmissionLimitReachedError("Failed to connect on any discovered server before timeout");
        }
        if (lastError !== undefined) {
            throw new PairRetransmissionLimitReachedError(
                `Failed to connect on any discovered server: ${lastError.message}`,
            );
        }
        throw new PairRetransmissionLimitReachedError("Failed to connect on any discovered server");
    } catch (error) {
        // Fire the abort so any in-flight stagger sleep cancels and any late PASE completion closes its session
        // via the winner/abort guard in launchAttempt's .then handler.
        if (!abort.aborted) {
            abort.abort(asError(error));
        }
        throw error;
    }
}

export namespace CommissioningConnection {
    export interface Options {
        /**
         * Commissioning candidates to attempt PASE with.
         *
         * {@link CommissioningConnectionPool} merges entries by `deviceIdentifier` and expands each device's
         * address list into independent `(device, address)` attempts.  The stagger delay applies globally
         * across those generated attempts (slot 0 fires immediately, slot N fires at N × staggerDelay) —
         * the intent is to serialise addresses of one physical device so the CHIP responder isn't hit with
         * concurrent PBKDFParamRequests it cannot handle.
         *
         * Callers that discover genuinely distinct devices should coordinate fan-out at a higher layer
         * (e.g. {@link ParallelPaseDiscovery}); passing multiple distinct devices here will serialise them
         * by the same stagger, which is usually not what you want for a multi-device race.
         */
        devices: CommissionableDevice[];

        /** Overall timeout for the entire connection attempt. */
        timeout: Duration;

        /**
         * Establishes a PASE session for the given candidate.  The provided {@link AbortSignal} fires when the
         * overall timeout expires or when another candidate wins the race first.  Implementations should respect the
         * signal and abort cleanly (e.g. by sending an InvalidParam status to prevent a 60-second device lockout).
         */
        establishSession: (
            address: ServerAddress,
            device: CommissionableDevice,
            signal: AbortSignal,
        ) => Promise<NodeSession>;

        /**
         * An external abort signal.  When fired, terminates all in-flight PASE attempts immediately.
         */
        externalAbort?: AbortSignal;

        /**
         * Delay between consecutive PASE attempt starts.  Defaults to the internal 5s production value.
         * Exposed primarily for tests that need to disable or shorten the stagger; production callers
         * should not override this.
         */
        staggerDelay?: Duration;
    }

    export interface Result {
        session: NodeSession;
        discoveryData: CommissionableDevice;
    }
}
