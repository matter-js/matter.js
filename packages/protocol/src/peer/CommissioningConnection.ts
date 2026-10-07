/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { CommissioningError, PairRetransmissionLimitReachedError } from "#peer/CommissioningError.js";
import { NodeSession } from "#session/NodeSession.js";
import {
    Abort,
    asError,
    causedBy,
    Duration,
    Logger,
    MatterAggregateError,
    NetworkError,
    NoResponseTimeoutError,
    Millis,
    Seconds,
    ServerAddress,
    Time,
    Timer,
    Timestamp,
    TimeoutError,
    UnexpectedDataError,
} from "@matter/general";
import { CommissioningConnectionAttempt, CommissioningConnectionPool } from "./CommissioningConnectionPool.js";
import { TransientPeerCommunicationError } from "./PeerCommunicationError.js";

const logger = Logger.get("CommissioningConnection");

// How long the latest PASE attempt runs before the next address of a device gets one, unless it settles first.
// Paired with the shorter cross-device stagger in ParallelPaseDiscovery.
const DELAY_BEFORE_NEXT_ADDRESS = Seconds(10);

/**
 * Attempts PASE establishment with the provided device candidates, returning the first successful session.
 *
 * All candidates come from {@link CommissioningConnection.Options.devices}, in their order, one PASE attempt per
 * (device, address).  This is used when addresses are already known (e.g. from a prior mDNS discovery or a
 * pre-configured address list).
 *
 * The first candidate launches immediately.  The next one launches once the latest attempt has settled or has run
 * for {@link DELAY_BEFORE_NEXT_ADDRESS}, but never while an attempt holds its responder, i.e. has received the
 * PBKDFParamResponse.  The CHIP SDK responder binds its single PASESession to the first PBKDFParamRequest exchange,
 * and a request on another exchange clears the handshake in progress, so addresses of one device (e.g. IPv6 ULA +
 * link-local + IPv4) must not be raced.  An older, unanswered attempt may still run when a newer one starts.
 *
 * If an attempt fails with a credential error the device is permanently dropped and its queued addresses are
 * skipped.  If it fails with a transient network/timeout error the remaining addresses are still tried.  The
 * process completes when one session is established, all candidates are exhausted, or the overall timeout fires.
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
    const delayBeforeNextAddress = options.delayBeforeNextAddress ?? DELAY_BEFORE_NEXT_ADDRESS;
    let lastError: Error | undefined;
    let lastNonRetryableError: Error | undefined;

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

    const queue = pool.availableCandidates();
    let holdingAttempts = 0;
    let latest: { startedAt: Timestamp; settled: boolean } | undefined;
    let nextAttemptTimer: Timer | undefined;

    // The one place that decides whether the next candidate starts, called whenever an attempt settles or the timer
    // fires.
    const schedule = () => {
        nextAttemptTimer?.stop();
        nextAttemptTimer = undefined;

        while (winner === undefined && !abort.aborted && holdingAttempts === 0) {
            while (queue.length > 0 && getDeviceAbort(queue[0].deviceKey).signal.aborted) {
                queue.shift();
            }
            const candidate = queue.shift();
            if (candidate === undefined) {
                return;
            }

            if (latest !== undefined && !latest.settled) {
                const remaining = delayBeforeNextAddress - Timestamp.delta(latest.startedAt, Time.nowUs);
                if (remaining > 0) {
                    queue.unshift(candidate);
                    nextAttemptTimer = Time.getTimer("PASE next address", Millis(remaining), schedule).start();
                    return;
                }
            }

            launchAttempt(candidate);
        }
    };

    const launchAttempt = (candidate: CommissioningConnectionAttempt) => {
        const attempt = { startedAt: Time.nowUs, settled: false };
        latest = attempt;

        // Compose global + per-device abort so either can cancel this attempt.
        const deviceAc = getDeviceAbort(candidate.deviceKey);
        const signal = AbortSignal.any([abort.signal, deviceAc.signal]);

        let holdsResponder = false;
        const onPbkdfParamResponse = () => {
            if (!holdsResponder) {
                holdsResponder = true;
                holdingAttempts++;
            }
        };

        const p: Promise<CommissioningConnection.Result | null> = options
            .establishSession(candidate.address, candidate.device, { signal, onPbkdfParamResponse })
            .then(session => {
                // deviceAc fired ⇒ this device was dropped for invalid credentials, so a late success on
                // another of its addresses must not win.
                if (winner !== undefined || abort.aborted || deviceAc.signal.aborted) {
                    // Close this session so we don't leak a PASE channel.  A credential drop fires only
                    // deviceAc (not the outer abort), so use the composed signal's reason — abort.reason
                    // would be empty and lose the real cause.
                    session
                        .initiateForceClose({
                            cause: asError(
                                signal.reason ??
                                    new CommissioningError(
                                        "PASE session lost the race to another commissioning candidate",
                                    ),
                            ),
                        })
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
                        // Wrong passcode or invalid PASE data — all addresses of this device will fail identically;
                        // cancel them now.
                        logger.info(`Dropping device ${candidate.device.deviceIdentifier}:`, asErr.message);
                        lastNonRetryableError = asErr;
                        deviceAc.abort(asErr);
                        pool.markInvalidCredentials(candidate.deviceKey);
                    } else if (causedBy(asErr, NoResponseTimeoutError, TransientPeerCommunicationError, NetworkError)) {
                        lastError = asErr;
                        logger.warn(
                            `Address ${ServerAddress.urlFor(candidate.address)} unreachable for ${candidate.device.deviceIdentifier}`,
                        );
                    } else {
                        // Non-retryable error — preserve original type for caller.
                        abort.abort(asErr);
                        lastNonRetryableError = asErr;
                    }
                }
                return null;
            })
            .finally(() => {
                pending.delete(p);
                attempt.settled = true;
                if (holdsResponder) {
                    holdingAttempts--;
                }
                schedule();
            });

        pending.add(p);
    };

    schedule();

    try {
        // Drain until a winner is picked or the outer abort fires, rather than short-circuiting on the first
        // failure.  A winner fires the abort, which ends the wait even when it launched after the wait began.
        while (pending.size > 0 && winner === undefined && !abort.aborted) {
            await abort.race(...pending);
        }

        if (winner !== undefined) {
            // Do NOT await loser cleanup: a loser stuck in an abort-unresponsive MRP wait would age the won
            // session past the device pairing failsafe, killing it before commissioning uses it.
            MatterAggregateError.allSettled([...pending]).catch(error =>
                logger.warn("Error during losing PASE attempt cleanup:", asError(error)),
            );
            return winner;
        }

        // No winner — wait for every attempt to settle so we report the most specific failure below.
        await MatterAggregateError.allSettled([...pending]);
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
        // Fire the abort so any in-flight attempt cancels and any late PASE completion closes its session
        // via the winner/abort guard in launchAttempt's .then handler.
        if (!abort.aborted) {
            abort.abort(asError(error));
        }
        throw error;
    } finally {
        nextAttemptTimer?.stop();
    }
}

export namespace CommissioningConnection {
    export interface Options {
        /**
         * Commissioning candidates to attempt PASE with.
         *
         * {@link CommissioningConnectionPool} merges entries by `deviceIdentifier` and expands each device's
         * address list into independent `(device, address)` attempts, which launch one after the other across
         * all devices (see {@link CommissioningConnection}).
         *
         * Callers that discover genuinely distinct devices should coordinate fan-out at a higher layer
         * (e.g. {@link ParallelPaseDiscovery}); passing multiple distinct devices here serialises them too, which is
         * usually not what you want for a multi-device race.
         */
        devices: CommissionableDevice[];

        /** Overall timeout for the entire connection attempt. */
        timeout: Duration;

        /**
         * Establishes a PASE session for the given candidate.
         */
        establishSession: (
            address: ServerAddress,
            device: CommissionableDevice,
            context: EstablishSessionContext,
        ) => Promise<NodeSession>;

        /**
         * An external abort signal.  When fired, terminates all in-flight PASE attempts immediately.
         */
        externalAbort?: AbortSignal;

        /**
         * How long the latest attempt runs before the next candidate starts, unless it settles first.  Defaults to
         * the internal 10s production value.  Exposed primarily for tests that need to disable or shorten it;
         * production callers should not override this.
         */
        delayBeforeNextAddress?: Duration;
    }

    export interface EstablishSessionContext {
        /**
         * Fires when the overall timeout expires or when another candidate wins the race first.  Implementations
         * should respect it and abort cleanly (e.g. by sending an InvalidParam status to prevent a 60-second device
         * lockout).
         */
        signal: AbortSignal;

        /** Call once the PBKDFParamResponse has arrived; no further candidate launches until this attempt settles. */
        onPbkdfParamResponse: () => void;
    }

    export interface Result {
        session: NodeSession;
        discoveryData: CommissionableDevice;
    }
}
