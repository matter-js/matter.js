/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkProfile } from "#peer/NetworkProfile.js";
import type { ServerAddressUdp } from "@matter/general";

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
     * Override the destination address for this interaction's exchange.
     *
     * When set, messages are sent to this address instead of the session's default peer address,
     * without affecting other exchanges on the session.
     */
    addressOverride?: ServerAddressUdp;
}
