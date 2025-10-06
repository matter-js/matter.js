/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import type { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { InternalError, Observable, ObserverGroup } from "#general";
import type { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";

/**
 * High-level change notification service.
 *
 * This service provides an optimized path to detecting property changes for all endpoints associated with a node.  This
 * includes endpoints on peers.
 */
export class ChangeNotificationService {
    #change = new Observable<[changes: ChangeNotificationService.Change]>();
    #observers = new Map<Node, ObserverGroup>();

    constructor(node: ServerNode) {
        this.#beginNodeObservation(node);

        if (node.lifecycle.isReady) {
            this.#beginPeerObservation(node);
        } else {
            node.lifecycle.ready.once(() => this.#beginPeerObservation(node));
        }
    }

    /**
     * Change event source.
     */
    get change() {
        return this.#change;
    }

    /**
     * Invoked by the {@link BehaviorBacking} when state changes.
     */
    broadcastUpdate(backing: BehaviorBacking, properties: string[]) {
        const { endpoint, type: behavior } = backing;
        this.#change.emit({
            kind: "update",
            endpoint,
            behavior,
            version: backing.datasource.version,
            properties,
        });
    }

    close() {
        for (const observers of this.#observers.values()) {
            observers.close();
        }
        this.#observers.clear();
    }

    #beginNodeObservation(node: Node) {
        const observers = new ObserverGroup();
        this.#observers.set(node, observers);

        observers.on(node.lifecycle.changed, (type, endpoint) => {
            switch (type) {
                case EndpointLifecycle.Change.Destroyed:
                    this.#change.emit({
                        kind: "delete",
                        endpoint,
                    });
                    if (endpoint == node) {
                        observers.close();
                        this.#observers.delete(node);
                    }
                    break;
            }
        });
    }

    #beginPeerObservation(node: ServerNode) {
        const observers = this.#observers.get(node);

        if (observers === undefined) {
            throw new InternalError("Change notification initialization order is broken");
        }

        observers.on(node.peers.added, this.#beginNodeObservation.bind(this));
    }
}

export namespace ChangeNotificationService {
    export type Key = string | number;

    /**
     * Emits when state changes.
     *
     * If present, {@link properties} indicates the specific updated properties.  Otherwise the recipient should
     * consider all properties.
     */
    export interface PropertyUpdate {
        kind: "update";
        endpoint: Endpoint;
        behavior: Behavior.Type;
        version: number;
        properties?: string[];
    }

    /**
     * Emits when endpoints/nodes are deleted.
     *
     * This indicates to the recipient to drop the associated data subtree.
     */
    export interface EndpointDelete {
        kind: "delete";
        endpoint: Endpoint;
    }

    export type Change = PropertyUpdate | EndpointDelete;
}
