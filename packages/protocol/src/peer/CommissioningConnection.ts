/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissionableDevice } from "#common/Scanner.js";
import { PairRetransmissionLimitReachedError } from "#peer/ControllerDiscovery.js";
import { NodeSession } from "#session/NodeSession.js";
import {
    Abort,
    asError,
    causedBy,
    Duration,
    Logger,
    MatterAggregateError,
    Millis,
    NoResponseTimeoutError,
    ServerAddress,
    UnexpectedDataError,
} from "@matter/general";
import { CommissioningConnectionAttempt, CommissioningConnectionPool } from "./CommissioningConnectionPool.js";
import { TransientPeerCommunicationError } from "./PeerCommunicationError.js";

const logger = Logger.get("CommissioningConnection");

/**
 * Attempts PASE establishments in parallel across all provided device candidates, returning the first successful
 * session.
 *
 * **Static mode** (no {@link CommissioningConnection.Options.discoveredDevices}): all candidates come from
 * {@link CommissioningConnection.Options.devices} and are launched immediately in parallel.  This is the fast path
 * used when addresses are already known (e.g. from a prior mDNS discovery).
 *
 * **Dynamic mode** ({@link CommissioningConnection.Options.discoveredDevices} provided): candidates are polled
 * every ~200 ms and merged with the initial set as discovery progresses.  This is the path used when the device
 * still needs to be located on the network. This is used by the legacy code path and can be removed when we remove this.
 *
 * In both modes each device receives exactly one concurrent PASE attempt at a time.  If an attempt fails with a
 * credential error the device is permanently dropped.  If it fails with a transient network/timeout error the next
 * available address for that device is tried on the next poll cycle (dynamic) or the remaining addresses are still
 * in-flight (static).  The process completes when one session is established, all candidates are exhausted, or the
 * overall timeout fires.
 *
 * When the first PASE session is established the abort signal passed to
 * {@link CommissioningConnection.Options.establishSession} fires on all remaining in-flight attempts, allowing them
 * to cancel cleanly (e.g. by sending an InvalidParam status to the device to prevent a 60-second pairing lockout).
 */
export async function CommissioningConnection(
    options: CommissioningConnection.Options,
): Promise<CommissioningConnection.Result> {
    using abort = new Abort({ timeout: options.timeout, abort: options.externalAbort });
    const pool = new CommissioningConnectionPool(options.devices);
    let lastError: Error | undefined;
    let lastNonRetryableError: Error | undefined;

    // Deduplicates in-flight attempts by attemptKey (device+address) across dynamic poll cycles.
    const inFlight = new Set<string>();

    // Permanently excludes attempt keys that failed with a transient error, preventing infinite retries in
    // dynamic mode when a failed address reappears in subsequent discovery results.
    const permanentlyExcluded = new Set<string>();

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

    const launchAttempt = (candidate: CommissioningConnectionAttempt) => {
        if (inFlight.has(candidate.attemptKey)) return;
        inFlight.add(candidate.attemptKey);

        // Compose global + per-device abort so either can cancel this attempt.
        const deviceAc = getDeviceAbort(candidate.deviceKey);
        const signal = AbortSignal.any([abort.signal, deviceAc.signal]);

        const p: Promise<CommissioningConnection.Result | null> = options
            .establishSession(candidate.address, candidate.device, signal)
            .then(session => {
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
                    } else if (causedBy(asErr, NoResponseTimeoutError, TransientPeerCommunicationError)) {
                        lastError = asErr;
                        permanentlyExcluded.add(candidate.attemptKey);
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

    const { discoveredDevices } = options;

    if (discoveredDevices !== undefined) {
        // Dynamic discovery: poll for new devices every 200ms and launch PASE attempts as they appear.
        while (!abort.aborted) {
            try {
                pool.addDevices(await abort.attempt(discoveredDevices()));
            } catch (error) {
                if (!abort.aborted) {
                    logger.warn("Discovery poll failed:", asError(error));
                }
                break;
            }

            for (const candidate of pool.availableCandidates(inFlight, permanentlyExcluded)) {
                launchAttempt(candidate);
            }

            if (pending.size === 0) {
                // No in-flight attempts yet.  Keep polling until timeout fires — new devices may appear.
                await abort.sleep("wait for commissioning candidates", Millis(200));
                continue;
            }

            // Wait for the next attempt to settle or for the discovery poll interval.
            await Promise.race([...pending, abort.sleep("commissioning discovery interval", Millis(200))]);

            if (winner !== undefined) {
                break;
            }
        }
    } else {
        // Static candidates: launch all immediately and wait for them to settle or for the timeout/external abort.
        for (const candidate of pool.availableCandidates(inFlight)) {
            launchAttempt(candidate);
        }
        if (pending.size > 0) {
            await abort.race(...pending);
        }
    }

    // Snapshot any remaining in-flight attempts (some may have self-removed via .finally() already) and
    // await them.  They should resolve quickly since the abort signal has already fired.
    await MatterAggregateError.allSettled([...pending]).catch(() => {});

    if (winner !== undefined) {
        return winner;
    }
    if (lastNonRetryableError !== undefined) {
        throw lastNonRetryableError;
    }
    if (abort.aborted && lastError === undefined) {
        throw new PairRetransmissionLimitReachedError("Failed to connect on any discovered server before timeout");
    }
    if (lastError !== undefined) {
        throw new PairRetransmissionLimitReachedError(
            `Failed to connect on any discovered server: ${lastError.message}`,
        );
    }
    throw new PairRetransmissionLimitReachedError("Failed to connect on any discovered server");
}

export namespace CommissioningConnection {
    export interface Options {
        /** Initially known commissioning candidates. */
        devices: CommissionableDevice[];

        /** Overall timeout for the entire connection attempt. */
        timeout: Duration;

        /**
         * Polled every ~200ms to pick up newly-discovered candidates that were not present in {@link devices}.
         * Returning an empty array is fine; returning already-known devices is also fine (deduplication is handled
         * internally).
         *
         * When omitted, no polling occurs — all candidates are taken from {@link devices} and PASE is attempted
         * immediately without any discovery loop.
         */
        discoveredDevices?: () => Promise<CommissionableDevice[]>;

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
    }

    export interface Result {
        session: NodeSession;
        discoveryData: CommissionableDevice;
    }
}
