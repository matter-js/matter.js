/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, merge as mergeObjects, Minutes, Seconds } from "@matter/general";

/**
 * Parameters that control network timing for Matter sessions controlled by matter.js.
 */
export interface PeerTimingParameters {
    /**
     * Overall timeout for establishing connections.
     *
     * This timeout applies to the process of establishing a new session with a peer.  It only applies if you do not
     * override and do not supply an {@link AbortSignal}.
     */
    defaultConnectionTimeout: Duration;

    /**
     * The longest time between retries.
     *
     * This is the longest period between packets between MRP retries when we attempt initial contact.
     */
    maxDelayBetweenInitialContactRetries: Duration;

    /**
     * Wait time before trying the next address.
     *
     * We run addresses in parallel but delay the time between the initial attempt for each address by this amount.
     */
    delayBeforeNextAddress: Duration;

    /**
     * Delay following a low-level network error.
     *
     * We use this when we could not contact the peer.
     *
     * Note that this includes MRP timeouts *except* for initial contact; in that case we continue MRP retransmission
     * until response or abort.
     */
    delayAfterNetworkError: Duration;

    /**
     * Delay following report of general error from peer.
     *
     * We use this when we have successfully contacted a peer but could not negotiate a new session.
     */
    delayAfterPeerError: Duration;

    /**
     * Delay for an unhandled exception.
     *
     * Any error that occurs here should be considered internal or should use one of above delays instead.
     */
    delayAfterUnhandledError: Duration;

    /**
     * Minimum interval between kick signals reaching the connection handler.
     *
     * Rapid-fire kicks (e.g. from mDNS bursts) are throttled at the observable level so only one
     * signal per interval is delivered.
     */
    kickThrottleInterval: Duration;

    /**
     * Minimum number of MRP retransmissions before a kick may restart the exchange.
     *
     * Gives the peer a fair chance to respond before aborting. A kick arriving while the exchange
     * has retransmitted fewer than this many times is suppressed.
     */
    kickMinRetransmissions: number;

    /**
     * Per-trigger cooldowns for kick-initiated CASE exchange restarts.
     *
     * When a kick fires, the current handshake exchange is aborted and restarted from scratch.
     * These cooldowns prevent restarts from happening too frequently.
     */
    kickRestartCooldown: {
        /** Cooldown after a restart triggered by DNS-SD address change. */
        addressChange: Duration;

        /** Cooldown after a restart triggered by an explicit {@link Peer.kick} call. */
        connect: Duration;
    };

    /**
     * Delay after detecting mDNS address changes before probing the session.
     *
     * Address changes can arrive in bursts (e.g. Thread network rekey).  We wait this long after the last
     * change before checking whether the session's IP is still valid.
     */
    addressChangeStabilizationDelay: Duration;

    /**
     * Probe cooldown range for repeated address-change probes on the same IP.
     *
     * When mDNS keeps reporting the session IP as gone but probes succeed, the cooldown grows
     * using a Fibonacci-like sequence from {@link minimum} to {@link maximum}.  The cooldown
     * resets when the probed IP changes or a probe fails.
     */
    addressChangeProbeCooldown: {
        /** Initial cooldown between probes (first two probes use this). */
        minimum: Duration;

        /** Upper bound — cooldown stops growing beyond this. */
        maximum: Duration;
    };
}

const complete = Symbol("complete-timing-parameters");

interface Internal extends PeerTimingParameters {
    [complete]: true;
}

export function PeerTimingParameters(options?: Partial<PeerTimingParameters>) {
    if (options && (options as Internal)[complete]) {
        return options as PeerTimingParameters;
    }

    const result = { ...PeerTimingParameters.defaults } as Record<string | symbol, unknown>;
    if (options) {
        for (const key of Object.keys(options)) {
            const value = (options as Record<string, unknown>)[key];
            if (value !== undefined) {
                result[key] = value;
            }
        }
    }
    result[complete] = true;

    return result as unknown as PeerTimingParameters;
}

export namespace PeerTimingParameters {
    /**
     * Merge overrides on top of a base set of timing parameters.
     *
     * Unlike calling {@link PeerTimingParameters} directly (which merges on top of {@link defaults}), this starts from
     * an arbitrary base.  Only override fields that are explicitly defined and non-undefined are applied.
     */
    export function merge(base: PeerTimingParameters, overrides: Partial<PeerTimingParameters>): PeerTimingParameters {
        const result = mergeObjects(base, overrides) as Internal;
        result[complete] = true;
        return result;
    }

    // TODO - tune these
    export const defaults: PeerTimingParameters = {
        defaultConnectionTimeout: Seconds(90),
        maxDelayBetweenInitialContactRetries: Minutes(2),

        // We assume 30s processing time on peer for single Sigma actions, so give one IP a bit of time
        // to have a chance before potentially adding a load with a second try
        delayBeforeNextAddress: Seconds(45),
        delayAfterNetworkError: Seconds(15),
        delayAfterPeerError: Minutes(5),
        delayAfterUnhandledError: Minutes(2),
        kickThrottleInterval: Seconds(3),
        kickMinRetransmissions: 2,
        kickRestartCooldown: {
            addressChange: Minutes(30),
            connect: Minutes(10),
        },
        addressChangeStabilizationDelay: Seconds(10),
        addressChangeProbeCooldown: {
            minimum: Minutes(2),
            maximum: Minutes(60),
        },
    };
}
