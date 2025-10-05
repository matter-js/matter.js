/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiscoveryData } from "#common/Scanner.js";
import { ServerAddressUdp } from "#general";
import type { PeerDataStore } from "#peer/PeerAddressStore.js";
import { SessionParameters } from "#session/Session.js";
import { PeerAddress } from "./PeerAddress.js";

/**
 * Operational information for a single peer.
 *
 * For our purposes a "peer" is another node commissioned to a fabric to which we have access.
 */
export interface OperationalPeer {
    /**
     * The logical address of the peer.
     */
    address: PeerAddress;

    /**
     * A physical address the peer may be accessed at, if known.
     */
    operationalAddress?: ServerAddressUdp;

    /**
     * The peer's session parameters reported during discovery.
     */
    sessionParameters?: SessionParameters;

    /**
     * Additional information collected while locating the peer.
     */
    discoveryData?: DiscoveryData;

    /**
     * The data store for the peer.
     */
    dataStore?: PeerDataStore;
}
