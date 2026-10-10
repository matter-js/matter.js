/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { PeerAddress, PeerSet } from "@matter/protocol";

/**
 * Provides the node description and the reservation of peer addresses.
 */
export class IdentityService {
    #node: Endpoint;
    #reservedPeerAddresses = new Set<PeerAddress>();

    constructor(node: Endpoint) {
        this.#node = node;
    }

    /**
     * Textual description of the node.
     */
    get nodeDescription() {
        return this.#node.toString();
    }

    /**
     * Release every address {@link reservePeerAddress} holds.
     *
     * A factory reset discards the fabrics those addresses belong to, and the service outlives the reset.
     */
    releaseReservedPeerAddresses() {
        this.#reservedPeerAddresses.clear();
    }

    /**
     * Detect whether a peer address is currently assigned to a peer.
     *
     * {@link PeerSet} is the source of truth for commissioned peers; the reservation set only covers the controller's
     * own node IDs and addresses reserved for an in-flight commissioning.
     */
    peerAddressInUse(address: PeerAddress) {
        address = PeerAddress(address);
        return this.#reservedPeerAddresses.has(address) || !!this.#node.env.maybeGet(PeerSet)?.has(address);
    }

    /**
     * Mark a peer address as in use.
     */
    reservePeerAddress(address: PeerAddress) {
        this.#reservedPeerAddresses.add(PeerAddress(address));
    }

    /**
     * Mark a peer address as available for use.
     */
    releasePeerAddress(address: PeerAddress) {
        this.#reservedPeerAddresses.delete(PeerAddress(address));
    }
}
