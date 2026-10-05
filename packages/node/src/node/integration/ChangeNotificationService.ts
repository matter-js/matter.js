/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Behavior } from "#behavior/Behavior.js";
import type { Events } from "#behavior/Events.js";
import type { BehaviorBacking } from "#behavior/internal/BehaviorBacking.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import type { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Lifecycle, Observable, ObserverGroup, Timestamp } from "@matter/general";
import { EventModel } from "@matter/model";
import { Val } from "@matter/protocol";
import { EventNumber, Priority } from "@matter/types";

/**
 * High-level change notification service.
 *
 * This service provides an optimized path to detecting property changes for all endpoints associated with a node.  This
 * includes endpoints on peers.
 */
export class ChangeNotificationService {
    #change = new Observable<[changes: ChangeNotificationService.Change]>();
    #nodeObservers = new Map<Node, NodeObserver>();
    #peerObservers = new ObserverGroup();

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

    /**
     * Invoked by {@link Events} or {@link ClientEventEmitter} as events occur.
     */
    broadcastEvent(
        endpoint: Endpoint,
        behavior: Behavior.Type,
        event: EventModel,
        occurrence: ChangeNotificationService.OccurrenceProperties,
    ) {
        this.#change.emit({
            kind: "event",
            endpoint,
            behavior,
            event,
            ...occurrence,
        });
    }

    close() {
        for (const observer of this.#nodeObservers.values()) {
            observer.close();
        }
        this.#nodeObservers.clear();
        this.#peerObservers.close();
    }

    #beginNodeObservation(node: Node) {
        if (this.#nodeObservers.has(node)) {
            return;
        }

        this.#nodeObservers.set(
            node,
            new NodeObserver(
                node,
                change => this.#change.emit(change),
                () => this.#nodeObservers.delete(node),
            ),
        );
    }

    #beginPeerObservation(node: ServerNode) {
        // Peers restored from storage are added while the peer collection is created, before anyone can observe it
        const { peers } = node;
        for (const peer of peers) {
            this.#beginNodeObservation(peer);
        }
        this.#peerObservers.on(peers.added, this.#beginNodeObservation.bind(this));
    }
}

/**
 * Reports deletions and readability of one node's endpoints.
 */
class NodeObserver {
    #node: Node;
    #emit: (change: ChangeNotificationService.Change) => void;
    #onClosed: () => void;
    #observers = new ObserverGroup();
    #constructions = new Map<Endpoint, ObserverGroup>();

    constructor(node: Node, emit: (change: ChangeNotificationService.Change) => void, onClosed: () => void) {
        this.#node = node;
        this.#emit = emit;
        this.#onClosed = onClosed;

        this.#observers.on(node.lifecycle.changed, this.#lifecycleChanged.bind(this));

        // A node constructing when observation begins has reported its installation already
        if (node.construction.status === Lifecycle.Status.Initializing) {
            this.#observeConstruction(node);
        }
    }

    close() {
        this.#observers.close();
        for (const group of this.#constructions.values()) {
            group.close();
        }
        this.#constructions.clear();
    }

    #lifecycleChanged(type: EndpointLifecycle.Change, endpoint: Endpoint) {
        switch (type) {
            case EndpointLifecycle.Change.Installed:
                this.#observeConstruction(endpoint);
                break;

            case EndpointLifecycle.Change.Destroyed:
                if (endpoint.maybeNumber !== undefined) {
                    this.#emit({ kind: "delete", endpoint });
                }
                if (endpoint === this.#node) {
                    this.close();
                    this.#onClosed();
                }
                break;
        }
    }

    /**
     * Report readability once the construction {@link endpoint} started completes.  Construction status does not
     * bubble, so the endpoint is observed directly until that construction ends.
     */
    #observeConstruction(endpoint: Endpoint) {
        if (this.#constructions.has(endpoint)) {
            return;
        }
        const group = new ObserverGroup();
        this.#constructions.set(endpoint, group);
        group.on(endpoint.construction.change, status => {
            switch (status) {
                case Lifecycle.Status.Active:
                case Lifecycle.Status.Crashed:
                case Lifecycle.Status.Destroyed:
                    group.close();
                    this.#constructions.delete(endpoint);
                    if (status === Lifecycle.Status.Active && endpoint.lifecycle.isReadable) {
                        this.#emit({ kind: "readable", endpoint });
                    }
                    break;
            }
        });
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
     * The wire timestamp variant {@link OccurrenceProperties.timestamp} carries. Matter Core §10.7 defines exactly
     * four and an event sets exactly one: an absolute time against the Posix epoch or against device system (uptime)
     * time, or, on either clock, a delta from the preceding event of the same priority. A consumer forwarding the
     * occurrence must not guess which, as neither the clock nor absolute-vs-delta is recoverable from the value.
     */
    export type TimestampKind = "epoch" | "system" | "epoch-delta" | "system-delta";

    export interface OccurrenceProperties {
        number: EventNumber;
        timestamp: Timestamp;
        timestampKind: TimestampKind;
        priority: Priority;
        payload?: Val.Struct;
    }

    /**
     * Emits when a Matter event occurs.
     */
    export interface EventOccurrence extends OccurrenceProperties {
        kind: "event";
        endpoint: Endpoint;
        behavior: Behavior.Type;
        event: EventModel;
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

    /**
     * Emits when an endpoint's state becomes readable because a construction completed: every construction an endpoint
     * starts while its node is observed, and that of a node still constructing when its observation begins.
     *
     * State changes made while an endpoint was unreadable may not have reached a recipient that skipped them.
     */
    export interface EndpointReadable {
        kind: "readable";
        endpoint: Endpoint;
    }

    export type Change = PropertyUpdate | EventOccurrence | EndpointDelete | EndpointReadable;
}
