/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { ImplementationError, InternalError } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import type { PeerAddress } from "#protocol";
import type { FabricIndex, NodeId } from "#types";

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
    assertNumberAvailable(number: number, endpoint: Endpoint) {
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
     * Assign a peer address.
     */
    assignNodeAddress(_node: ClientNode, _fabricIndex: FabricIndex, _nodeId?: NodeId): PeerAddress {
        throw new InternalError("Client node ID assignment is not initialized");
    }

    /**
     * Release a peer address.
     */
    releaseNodeAddress(_address: PeerAddress) {}
}
