/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import type { ImmutableSet } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import type { PeerAddress } from "#protocol";

/**
 * Create a new client node.
 *
 * You may provide a factory in a node's environment to specialize ClientNode initialization.  If you do so you must
 * install new nodes in the ServerNode's "nodes" property.
 */
export abstract class ClientNodeFactory {
    abstract find(descriptor: RemoteDescriptor): ClientNode | undefined;
    abstract create(options: ClientNode.Options, peerAddress?: PeerAddress): ClientNode;
    abstract nodes: ImmutableSet<ClientNode>;
}
