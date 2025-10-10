/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServerNode } from "#node/ServerNode.js";
import { ChangesResource } from "./ChangesResource.js";
import { EndpointContainerResource } from "./EndpointContainerResource.js";
import { NodeResource } from "./NodeResource.js";

/**
 * Specialization of {@link NodeResource} that adds "peers" collection and "changes" subscription item.
 */
export class ServerNodeResource extends NodeResource {
    /**
     * For the root node, we provide a "flat" namespace that is rooted at Node IDs, in addition to the normal
     * endpoint namespace.  This could conceivably lead to conflict but we also provide typed subcollections that
     * cannot have conflicts.
     *
     * We disable the flat namespace if the node is referenced as a child of itself so conflicts cannot occur.
     */
    override async childFor(name: string) {
        if (!this.isSelfReferential) {
            // Dedicated name "host" and my node ID always map back to myself
            if (name === this.id || name === "host") {
                return this;
            }

            // If the name is a peer, map to that
            const peer = this.node.peers.get(name);
            if (peer) {
                return new NodeResource(peer.agentFor(this.agent.context), this);
            }
        }

        switch (name) {
            // Explicit collection of peers
            case "peers":
                return new EndpointContainerResource(
                    this,
                    "peers",
                    () => this.node.peers.map(peer => peer.id),
                    id => {
                        const peer = this.node.peers.get(id);
                        if (peer) {
                            return new NodeResource(peer.agentFor(this.agent.context), this);
                        }
                    },
                );

            // Subscription target
            case "changes":
                return new ChangesResource(this);
        }

        return super.childFor(name);
    }

    override get node() {
        return this.agent.endpoint as ServerNode;
    }
}
