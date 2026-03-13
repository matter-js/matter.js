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
     * Minimum delay between MRP loop "kicks".
     */
    minimumTimeBetweenMrpKicks: Duration;

    /**
     * Minimum time between kick-triggered exchange restarts initiated by DNS-SD address discovery.
     *
     * A "discover" kick restarts the CASE handshake exchange from scratch with a fresh MRP backoff,
     * allowing the new address to be used immediately. This threshold prevents mDNS churn from
     * restarting the handshake too frequently.
     */
    mrpKickRestartIntervalDiscover: Duration;

    /**
     * Minimum time between kick-triggered exchange restarts initiated by a user/connect call.
     *
     * Same mechanic as {@link mrpKickRestartIntervalDiscover} but for explicit `peer.kick()` calls.
     * Shorter threshold because user intent is stronger than passive discovery.
     */
    mrpKickRestartIntervalConnect: Duration;
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
        minimumTimeBetweenMrpKicks: Seconds(3),
        mrpKickRestartIntervalDiscover: Minutes(30),
        mrpKickRestartIntervalConnect: Minutes(10),
    };
}
