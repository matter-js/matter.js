/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NetworkProfile } from "#peer/NetworkProfile.js";

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
}
