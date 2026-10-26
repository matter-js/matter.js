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
import { MatterAggregateError } from "@matter/general";
import { type ClientRead, Read } from "@matter/protocol";
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
     * The erase of a part restarts the part and its parts with empty caches, and its finish reads their clusters from
     * the peer again.  A failed read rejects the erase.
     */
    async prepareEraseDescendant(endpoint: Endpoint): Promise<EndpointInitializer.Erasure> {
        const subtree = this.#subtreeOf(endpoint);
        return {
            wipe: () =>
                MatterAggregateError.settleSeries(
                    [
                        () => this.#eraseStores(subtree),
                        () => {
                            for (const endpoint of subtree) {
                                this.#structure?.renewStores(endpoint);
                            }
                        },
                    ],
                    `Error erasing ${subtree[0]}`,
                ),
            finish: () => this.#readAgain(subtree),
        };
    }

    /**
     * Read every cluster of {@link subtree} from the peer without data version filters, so the erased endpoints show
     * the values of the peer without waiting for the peer to change them.  An offline node reads them when it
     * reconnects, as its stores no longer hold a data version.
     */
    async #readAgain(subtree: Endpoint[]) {
        if (!this.#node.lifecycle.isOnline) {
            return;
        }
        const request: ClientRead = {
            ...Read({
                fabricFilter: this.structure.cacheFabricFiltered,
                attributes: subtree
                    .filter(endpoint => endpoint.lifecycle.hasNumber)
                    .map(endpoint => ({ endpointId: endpoint.number })),
            }),
            includeKnownVersions: true,
        };
        for await (const chunk of this.#node.interaction.read(request)) {
            for await (const _report of chunk);
        }
    }

    async prepareDeleteDescendant(endpoint: Endpoint): Promise<EndpointInitializer.Erasure> {
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

    async deactivateDescendant(_endpoint: Endpoint) {
        // nothing to do
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
