/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import type { ClientNode } from "#node/ClientNode.js";
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
                return this.#resourceForPeer(peer);
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
                            return this.#resourceForPeer(peer);
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

    /**
     * A peer resource acts in this request's transaction but validates as the peer's own actions do, so the device
     * rather than the local model decides on conformance.
     */
    #resourceForPeer(peer: ClientNode) {
        return new NodeResource(peer.agentFor(withClientPeer(this.agent.context, peer.clientPeerContext)), this);
    }
}

function withClientPeer(context: ActionContext, clientPeerContext: ClientNode["clientPeerContext"]): ActionContext {
    return Object.freeze(
        Object.create(Object.getPrototypeOf(context), {
            ...Object.getOwnPropertyDescriptors(context),
            clientPeerContext: { value: clientPeerContext ?? {}, enumerable: true },
        }),
    );
}
