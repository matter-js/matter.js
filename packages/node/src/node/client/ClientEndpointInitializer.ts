/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import { ClientBehaviorBacking } from "#behavior/internal/ClientBehaviorBacking.js";
import { ServerBehaviorBacking } from "#behavior/internal/ServerBehaviorBacking.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { PeerBehavior } from "#node/client/PeerBehavior.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ClientNodeStore } from "#storage/client/ClientNodeStore.js";
import { ImplementationError, MatterAggregateError } from "@matter/general";
import { ClientEventEmitter } from "./ClientEventEmitter.js";
import { ClientStructure } from "./ClientStructure.js";

export class ClientEndpointInitializer extends EndpointInitializer {
    #node: ClientNode;
    #store: ClientNodeStore;
    #structure?: ClientStructure;

    /**
     * @param store the store this initialization of {@link node} loaded; it serves the behaviors of that
     * initialization only
     */
    constructor(node: ClientNode, store: ClientNodeStore) {
        super();
        this.#node = node;
        this.#store = store;
    }

    /**
     * Throw {@link ImplementationError} for an erase, delete or close of an endpoint below a peer, as its endpoints
     * mirror the peer.  The structure of the node removes an endpoint the peer drops, and a verb of the node covers its
     * endpoints.  Every verb is admitted for the endpoints of a group.
     */
    override assertVerbAdmitted(endpoint: Endpoint, verb: EndpointInitializer.Verb) {
        if (this.#node.endpointsMirrorPeer && endpoint !== this.#node) {
            throw new ImplementationError(
                `Cannot ${verb} ${endpoint} because the endpoint mirrors the peer; ${verb} the node ${this.#node} instead`,
            );
        }
    }

    async prepareEraseDescendant(endpoint: Endpoint): Promise<EndpointInitializer.Erasure> {
        return this.#erasureOf(endpoint);
    }

    async prepareDeleteDescendant(endpoint: Endpoint): Promise<EndpointInitializer.Erasure> {
        return this.#erasureOf(endpoint);
    }

    #erasureOf(endpoint: Endpoint): EndpointInitializer.Erasure {
        const subtree = this.#subtreeOf(endpoint);
        return {
            wipe: () => this.#eraseStores(subtree),
        };
    }

    // Stores are per endpoint number, so a wipe of an endpoint covers each of its parts; taken before the reset
    #subtreeOf(endpoint: Endpoint) {
        const subtree = new Array<Endpoint>();
        endpoint.visit(endpoint => {
            subtree.push(endpoint);
        });
        return subtree;
    }

    async #eraseStores(subtree: Endpoint[]) {
        await MatterAggregateError.settleSeries(
            subtree
                .filter(endpoint => endpoint.lifecycle.hasId)
                .map(endpoint => () => this.#store.eraseEndpointStore(endpoint.number)),
            `Error erasing the stores of ${subtree[0]}`,
        );
    }

    async deactivateDescendant(endpoint: Endpoint) {
        this.#structure?.forget(endpoint);
    }

    override createBacking(endpoint: Endpoint, type: Behavior.Type): BehaviorBacking {
        // Non-cluster behaviors are local, operating the same server behaviors
        if ((type as ClusterBehavior.Type).cluster === undefined) {
            const store = this.#store.storeForEndpoint(endpoint).createStoreForLocalBehavior(type.id);
            return new ServerBehaviorBacking(endpoint, type, store, endpoint.behaviors.optionsFor(type));
        }

        // Cluster behaviors must be instrumented for access to a remote cluster.  If already instrumented this is a
        // no-op, otherwise it creates a new type extension
        const peerType = PeerBehavior({ kind: "known", behavior: type as ClusterBehavior.Type });

        // Activate remote behavior
        const store = this.structure.storeForRemote(endpoint, peerType);
        return new ClientBehaviorBacking(endpoint, peerType, store, endpoint.behaviors.optionsFor(peerType));
    }

    get structure() {
        if (this.#structure === undefined) {
            const nodeStore = this.#store;
            this.#structure = new ClientStructure(
                this.#node,
                (endpoint, behaviorId) => nodeStore.storeForEndpoint(endpoint).createStoreForBehavior(behaviorId),
                { cacheRecord: nodeStore },
            );
            this.#structure.eventEmitter = ClientEventEmitter(this.#node as ClientNode, this.#structure);
        }
        return this.#structure;
    }
}
