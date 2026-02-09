/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { ImplementationError } from "#general";
import { PeerAddress } from "@matter/protocol";

/**
 * Thrown when there is a endpoint ID or number conflict.
 */
export class IdentityConflictError extends ImplementationError {}

/**
 * Provides NodeServer and Endpoint identification.
 */
export class IdentityService {
    #partsById?: Record<string, Endpoint | undefined>;
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
     * Ensure that a number is available for assignment to a {@link Endpoint}.
     */
    assertEndpointNumberAvailable(number: number, endpoint: Endpoint) {
        let other;
        if (this.#node.lifecycle.hasNumber && this.#node.number === number) {
            other = this.#node;
        } else {
            if (this.#partsById === undefined) {
                this.#partsById = this.#node.agentFor(LocalActorContext.ReadOnly).get(IndexBehavior).partsById;
            }
            other = this.#partsById?.[number];
        }
        if (other && other !== endpoint) {
            let owner;
            if (other.lifecycle.hasId) {
                owner = `endpoint ${other.id}`;
            } else {
                owner = `another endpoint`;
            }
            throw new IdentityConflictError(`Endpoint number ${number} is already assigned to ${owner}`);
        }
    }

    /**
     * Detect whether a peer address is currently assigned to a peer.
     */
    peerAddressInUse(address: PeerAddress) {
        return this.#reservedPeerAddresses.has(PeerAddress(address));
    }

    /**
     * Mark a peer address as in use.
     */
    reservePeerAddress(address: PeerAddress) {
        this.#reservedPeerAddresses.add(address);
    }

    /**
     * Mark a peer address as available for use.
     */
    releasePeerAddress(address: PeerAddress) {
        this.#reservedPeerAddresses.delete(PeerAddress(address));
    }
}
