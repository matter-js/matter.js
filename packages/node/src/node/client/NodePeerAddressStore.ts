/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import type { ClientNode } from "#node/ClientNode.js";
import { IdentityService } from "#node/server/IdentityService.js";
import type { ServerNode } from "#node/ServerNode.js";
import { OperationalPeer, PeerAddress, PeerAddressMap, PeerAddressStore } from "#protocol";
import { FabricIndex, NodeId } from "#types";
import { Crypto, ServerAddress, ServerAddressIp } from "@matter/general";

/**
 * This is an adapter for lower-level components in the protocol package.
 */
export class NodePeerAddressStore extends PeerAddressStore {
    #owner: ServerNode;

    /**
     * This is the map of all addresses allocated to nodes.  A node may appear in this map even if not yet commissioned
     * if commissioning is underway.
     */
    #assignedAddresses = new PeerAddressMap<ClientNode>();

    constructor(owner: ServerNode) {
        super();
        this.#owner = owner;

        // Install address management functions into IdentityService.  This indirection is just to avoid circular
        // dependencies
        const identityService = owner.env.get(IdentityService);
        identityService.assignNodeAddress = this.assignNewAddress.bind(this);
        identityService.releaseNodeAddress = this.deletePeer.bind(this);
    }

    assignNewAddress(node: ClientNode, fabricIndex: FabricIndex, nodeId?: NodeId) {
        while (nodeId === undefined) {
            nodeId = NodeId.randomOperationalNodeId(this.#owner.env.get(Crypto));
            if (this.#assignedAddresses.has({ fabricIndex, nodeId })) {
                nodeId = undefined;
            }
        }

        const address = PeerAddress({ fabricIndex, nodeId });

        this.#assignedAddresses.set(address, node);

        return address;
    }

    loadPeers(): OperationalPeer[] {
        this.#assignedAddresses = new PeerAddressMap();
        return [...this.#owner.peers]
            .map(node => {
                const commissioning = node.state.commissioning;
                if (!commissioning.peerAddress) {
                    return;
                }

                this.#assignedAddresses.set(commissioning.peerAddress, node);

                const addr = commissioning.addresses?.find(addr => addr.type === "udp");

                return {
                    address: commissioning.peerAddress,
                    operationalAddress: addr && (ServerAddress(addr) as ServerAddressIp),
                    discoveryData: RemoteDescriptor.fromLongForm(commissioning),
                };
            })
            .filter(addr => addr !== undefined);
    }

    async updatePeer(peer: OperationalPeer) {
        const node = this.#owner.peers.get(peer.address);
        if (!node) {
            return;
        }

        await node.act(agent => {
            const state = agent.commissioning.state;
            RemoteDescriptor.toLongForm(peer.discoveryData, state);
            if (peer.operationalAddress) {
                // TODO - modify lower tiers to pass along full set of operational addresses
                state.addresses = [peer.operationalAddress];
            }
        });
    }

    deletePeer(address: PeerAddress) {
        this.#assignedAddresses.delete(address);
    }

    createNodeStore(): undefined {}
}
