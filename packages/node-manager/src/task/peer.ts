/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode } from "@matter/node";
import { PeerAddress } from "@matter/protocol";

/**
 * The identity of a node, as anything that outlives the node's presence must name it.
 *
 * A node's local id (`peerN`) is reusable the moment the node is removed, so a record that kept one can resolve
 * to a different device. A {@link PeerAddress} holds while the peer is commissioned, which is as long as the
 * work a record describes can still mean anything; a group's address *is* its group id.
 *
 * Undefined only while a node has no address yet, which is a node that cannot be found again after a restart
 * either.
 */
export function addressOf(node: ClientNode): PeerAddress | undefined {
    // The node's own accessor, not its commissioning state: that one interns the address, caches it, and falls
    // back to storage while the behavior is not loaded. Reading the state directly gives a value with no
    // `toString`, and none at all for a node that is being torn down.
    return node.peerAddress;
}

/** How a node is named in a message: its address, or its local id while it has none. */
export function peerLabel(node: ClientNode): string {
    return addressOf(node)?.toString() ?? node.id;
}

/** The same, for an address a record already holds. */
export function addressLabel(address: PeerAddress): string {
    return PeerAddress(address).toString();
}
