/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkProfile } from "#peer/NetworkProfile.js";
import type { Duration, ServerAddressUdp } from "@matter/general";

/**
 * Represents a client request with customizable transmission behavior.
 */
export interface ClientRequest {
    /**
     * The ID of the network.
     *
     * Controls throttling behavior for interactions with the node.  Use "unlimited" to disable throttling.
     *
     * matter.js selects a default network automatically based on the network medium and, in the case of thread, the
     * wireless channel.
     *
     * @see {@link NetworkProfile}
     */
    network?: string;

    /**
     * Override the peer-medium MRP retransmission margin for this interaction.
     *
     * By default the margin derives from the peer's network medium (e.g. thread's longer margin), independent of
     * the {@link network} throttle profile.  Set this to override that default for a single interaction.
     */
    additionalMrpDelay?: Duration;

    /**
     * Override the destination address for this interaction's exchange.
     *
     * When set, messages are sent to this address instead of the session's default peer address,
     * without affecting other exchanges on the session.
     */
    addressOverride?: ServerAddressUdp;

    /**
     * Override the wait applied to a one-shot interaction with an idle LIT (Long Idle Time) ICD peer.
     *
     * A LIT peer is asleep most of the time, so matter.js holds the operation until the peer wakes (a Check-In re-arms
     * the awake window) before transmitting. The default wait is the peer's idle window plus margin; set this to bound
     * it per-call. On expiry the operation rejects with `IcdPeerAsleepError`. Ignored for non-LIT peers.
     */
    icdAwaitTimeout?: Duration;

    /**
     * Abandon this interaction when the signal aborts.
     *
     * The exchange stops sending and stops waiting — no further MRP retransmission — and the operation
     * rejects with `AbortedError`. A caller that must bound an interaction more tightly than the
     * peer's own response time uses this; without it the operation runs until matter.js gives up on
     * the peer, which is a property of the peer rather than of the caller's deadline.
     *
     * Aborting abandons the interaction rather than telling the peer anything, so a write or invoke
     * already in flight may still be acted on by the peer.
     */
    abort?: AbortSignal;
}
