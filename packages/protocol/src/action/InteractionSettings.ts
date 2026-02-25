/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Transaction } from "#general";
import { ExchangeLogContext } from "#protocol/MessageExchange.js";

/**
 * Configuration that applies to all interactions.
 */
export interface InteractionSettings {
    /**
     * The transaction for the interaction.
     *
     * If this is undefined the interaction executes in a new, independent transaction that commits automatically.
     */
    transaction?: Transaction;

    /**
     * Aborts the interaction if supported by the underlying implementation.
     *
     * Most interactions with local nodes are not abortable, but local command implementations may optionally implement
     * abort support.
     *
     * Interactions with remote nodes are abortable.
     */
    abort?: AbortSignal;

    /**
     * Timeout on connection.
     *
     * This limits the amount of time matter.js will wait for a new connection to the underlying node when performing
     * remote interactions.  This timeout is from the time of first connection attempt; if matter.js is already
     * attempting to establish a connection this may result in a timeout sooner than the supplied duration.
     *
     * The purpose of this timeout is to allow user-facing interactions to fail more quickly when the peer is known to
     * be unresponsive.
     *
     * Use {@link abort} with a timed {@link AbortSignal} to limit total interaction time.
     *
     * This parameter has no effect when interacting with local nodes.
     */
    connectionTimeout?: Duration;

    /** Additional context information for logging to be included at the beginning of the Message log. */
    logContext?: ExchangeLogContext;
}
