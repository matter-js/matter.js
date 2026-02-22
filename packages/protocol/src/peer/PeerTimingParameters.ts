/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Minutes, Seconds } from "#general";

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
}

const complete = Symbol("complete-timing-parameters");

interface Internal extends PeerTimingParameters {
    [complete]: true;
}

export function PeerTimingParameters(options?: Partial<PeerTimingParameters>) {
    if (options && (options as Internal)[complete]) {
        return options as PeerTimingParameters;
    }

    return {
        ...PeerTimingParameters.defaults,
        ...options,
        [complete]: true,
    } satisfies Internal as PeerTimingParameters;
}

export namespace PeerTimingParameters {
    // TODO - tune these
    export const defaults: PeerTimingParameters = {
        defaultConnectionTimeout: Seconds(90),
        maxDelayBetweenInitialContactRetries: Minutes(2),

        // We assume 30s processing time on peer for single Sigma actions, so give one IP a bit of time
        // to have a chance before potentially adding a load with a second try
        delayBeforeNextAddress: Seconds(60),
        delayAfterNetworkError: Seconds(15),
        delayAfterPeerError: Minutes(1),
        delayAfterUnhandledError: Minutes(2),
        minimumTimeBetweenMrpKicks: Seconds(3),
    };
}
