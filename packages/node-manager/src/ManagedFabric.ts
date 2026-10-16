/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode, ServerNode } from "@matter/node";
import { PeerAddress } from "@matter/protocol";
import { FabricIndex, GlobalFabricId } from "@matter/types";

/**
 * The one fabric a node manager manages.
 *
 * Groups, group keys, bindings and ACL entries are all fabric-scoped, and a controller may hold several
 * fabrics, so "key set 42" or "the members of this group" name one thing only once a fabric is fixed. Fixing it
 * here rather than in each task keeps it out of task parameters and out of stored records, which name a peer by
 * an address that carries the fabric already.
 *
 * @see {@link MatterSpecification.v16.Core} § 11.2.2
 */
export interface ManagedFabric {
    readonly index: FabricIndex;

    /**
     * The identity that outlives the index.
     *
     * A fabric index is recyclable — `FabricManager.allocateFabricIndex` wraps at 254 and reuses an index no
     * live fabric holds — so a manager that remembered only the index would adopt whatever fabric took it.
     */
    readonly globalId: GlobalFabricId;

    /** Whether this address names a peer of this fabric. A group address carries the fabric too. */
    owns(address: PeerAddress | undefined): boolean;

    /**
     * The peers of this fabric.
     *
     * A peer with no address yet is not one: it is mid-commissioning, and which fabric it joins is unsettled
     * until that finishes.
     */
    peers(): ClientNode[];

    /** The peer this address names, or undefined when it names one of another fabric. */
    peer(address: PeerAddress): ClientNode | undefined;
}

/** The managed fabric of a live controller, reading through to its peer container. */
export function managedFabricOf(root: ServerNode, index: FabricIndex, globalId: GlobalFabricId): ManagedFabric {
    const owns = (address: PeerAddress | undefined) => address !== undefined && address.fabricIndex === index;
    return {
        index,
        globalId,
        owns,
        peers: () => [...root.peers].filter(peer => owns(peer.peerAddress)),
        peer: address => (owns(address) ? root.peers.get(address) : undefined),
    };
}
