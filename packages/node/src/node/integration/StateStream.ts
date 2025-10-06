/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Abort, deepCopy, Duration, Gate, Millis, Timer } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { Val } from "#protocol";
import { EndpointNumber } from "#types";
import { ChangeNotificationService } from "./ChangeNotificationService.js";

/**
 * The time from change to notification to change broadcast when transitioning from dormant state.
 */
export const DEFAULT_COALESCE_INTERVAL = Millis(250);

/**
 * A streaming view of node state.
 *
 * These streams offer a basic synchronization primitive, delivering state from scratch or from arbitrary version
 * offsets.
 *
 * Each stream tracks a root {@link ServerNode} as well as any available state for known peers.
 */
export interface StateStream extends AsyncIterator<StateStream.Change> {}

/**
 * Open a new stream.
 */
export function StateStream(
    node: ServerNode,
    { nodes: nodeFilter, clusters: clusterFilter, versions, coalesceInterval, abort }: StateStream.Options = {},
) {
    const changeService = node.env.get(ChangeNotificationService);

    // Notification
    const gate = new Gate();
    coalesceInterval ??= DEFAULT_COALESCE_INTERVAL;
    let coalescenceTimer: Timer | undefined;

    // State of each endpoint/behavior
    const nodes = new Map<string, NodeState>();

    // The linked list of queued updates.  Note that we only queue a given behavior instance once so this queue cannot
    // grow unbounded
    let queueHead: QueueEntry | undefined;
    let queueTail: QueueEntry | undefined;

    // Seed version filters
    installInitialVersions();

    // Generate filter function
    const filter = generateFilter();

    return stream();

    /**
     * Generate events.
     */
    async function* stream(): AsyncGenerator<StateStream.Change, void, void> {
        try {
            changeService.change.on(changeListener);

            // Enqueue all applicable behaviors
            for (const n of [node, ...node.peers]) {
                for (const endpoint of n.endpoints) {
                    for (const behavior of Object.values(endpoint.behaviors.supported)) {
                        if (filter && !filter(endpoint.id, behavior.id)) {
                            continue;
                        }
                        enqueue({ node: n, endpoint, behavior });
                    }
                }
            }

            // Send updates
            while (true) {
                await Abort.race(abort, gate);
                if (Abort.is(abort)) {
                    break;
                }

                while (queueHead) {
                    // Yields in this loop are async; so need to check for abort on every iteration
                    if (Abort.is(abort)) {
                        break;
                    }

                    const { node, endpoint, behavior } = queueHead;
                    dequeue(queueHead);

                    // Endpoint delete
                    if (!behavior) {
                        yield { kind: "delete", node, endpoint };
                        continue;
                    }

                    // Property update
                    const state = stateOfBehavior(node.id, endpoint.number, behavior.id);
                    state.queueEntry = undefined;
                    let changes = endpoint.stateOf(behavior);
                    if (state.dirty) {
                        changes = Object.fromEntries(
                            [...state.dirty].map(name => [name, (changes as Val.Struct)[name]]),
                        );
                        state.dirty = undefined;
                    } else {
                        changes = deepCopy(changes);
                    }
                    yield {
                        kind: "update",
                        node,
                        endpoint,
                        behavior,
                        changes,
                        version: (state.version = endpoint.behaviors.versionOf(behavior)),
                    };
                }
                gate.close();
            }
        } finally {
            changeService.change.off(changeListener);
            coalescenceTimer?.stop();
        }
    }

    /**
     * Listener for {@link ChangeNotificationService}.
     */
    function changeListener(change: ChangeNotificationService.Change) {
        switch (change.kind) {
            case "update":
                enqueueUpdate(change);
                break;

            case "delete":
                enqueueDelete(change);
                break;
        }
    }

    /**
     * Access an {@link EndpointState}.
     */
    function stateOfEndpoint(node: string, endpoint: number) {
        let nodeState = nodes.get(node);
        if (nodeState === undefined) {
            nodes.set(node, (nodeState = new Map()));
        }

        let endpointState = nodeState.get(endpoint);
        if (endpointState === undefined) {
            nodeState.set(endpoint, (endpointState = { behaviors: new Map() }));
        }

        return endpointState;
    }

    /**
     * Access a {@link BehaviorState}.
     */
    function stateOfBehavior(node: string, endpoint: number, behavior: string) {
        const endpointState = stateOfEndpoint(node, endpoint);

        let behaviorState = endpointState.behaviors.get(behavior);
        if (behaviorState === undefined) {
            endpointState.behaviors.set(behavior, (behaviorState = {}));
        }

        return behaviorState;
    }

    /**
     * Pre-populate {@link BehaviorState}s with versions provided by caller.
     */
    function installInitialVersions() {
        if (!versions) {
            return;
        }

        for (const { node, endpoint, cluster, version } of versions) {
            stateOfBehavior(node, endpoint, cluster).version = version;
        }
    }

    /**
     * Generate a filter function if the caller provided filters.
     */
    function generateFilter(): ((node: string, behavior?: string) => boolean) | undefined {
        if (!nodeFilter && !clusterFilter) {
            return;
        }

        const whitelistedNodes = nodeFilter ? new Set(nodeFilter) : undefined;
        const whitelistedBehaviors = clusterFilter ? new Set(clusterFilter) : undefined;

        if (whitelistedNodes) {
            if (whitelistedBehaviors) {
                return (node, behavior) =>
                    whitelistedNodes.has(node) && (!behavior || whitelistedBehaviors.has(behavior));
            }

            return node => whitelistedNodes.has(node);
        }

        if (whitelistedBehaviors) {
            return (_node, behavior) => !behavior || whitelistedBehaviors.has(behavior);
        }
    }

    /**
     * Process a property update notification.
     */
    function enqueueUpdate(change: ChangeNotificationService.PropertyUpdate) {
        const { endpoint, behavior } = change;

        const node = endpoint.env.get(Node);
        if (filter && !filter(node.id, behavior.id)) {
            return;
        }

        const behaviorState = stateOfBehavior(node.id, endpoint.number, behavior.id);

        // Skip if version is already known
        if (behaviorState.version === change.version) {
            return;
        }

        // If already enqueued, just update state
        if (behaviorState.queueEntry) {
            if (change.properties) {
                // dirty === undefined means that all properties are already enqueued
                if (behaviorState.dirty) {
                    for (const prop of change.properties) {
                        // Subset of properties are dirty
                        behaviorState.dirty.add(prop);
                    }
                }
            } else {
                // All properties are now enqueued
                behaviorState.dirty = undefined;
            }
            behaviorState.version = change.version;
            return;
        }

        // Newly queued; set state appropriately
        behaviorState.dirty = change.properties ? new Set(change.properties) : undefined;
        behaviorState.queueEntry = { endpoint, node, behavior };
        enqueue(behaviorState.queueEntry);
    }

    /**
     * Process a delete notification.
     */
    function enqueueDelete(change: ChangeNotificationService.EndpointDelete) {
        const { endpoint } = change;

        const node = endpoint.env.get(Node);
        if (filter && !filter(node.id)) {
            return;
        }

        const endpointState = stateOfEndpoint(node.id, endpoint.number);

        // Dequeue all entries associated with the endpoint
        for (const { queueEntry } of endpointState.behaviors.values()) {
            if (queueEntry) {
                dequeue(queueEntry);
            }
        }

        // Delete state associated with the endpoint
        if (endpoint === node) {
            nodes.delete(node.id);
        } else {
            nodes.get(node.id)?.delete(endpoint.number);
        }

        // Enqueue for deletion
        enqueue({ endpoint, node });
    }

    /**
     * Add an entry to the queue.
     */
    function enqueue(entry: QueueEntry) {
        if (queueTail) {
            queueTail.next = entry;
            entry.prev = queueTail;
            queueTail = entry;
        } else {
            queueHead = queueTail = entry;
        }

        gate.open();
    }

    /**
     * Remove an entry from the queue.
     */
    function dequeue(entry: QueueEntry) {
        if (queueHead === entry) {
            queueHead = entry.next;
        }
        if (queueTail === entry) {
            queueTail = entry.prev;
        }
        if (entry.prev) {
            entry.prev.next = entry.next;
        }
        if (entry.next) {
            entry.next.prev = entry.prev;
        }
    }
}

interface QueueEntry {
    node: Node;
    endpoint: Endpoint;
    behavior?: Behavior.Type;
    prev?: QueueEntry;
    next?: QueueEntry;
}

interface NodeState extends Map<number, EndpointState> {}

interface EndpointState {
    /**
     * State for individual behaviors.
     */
    behaviors: Map<string, BehaviorState>;
}

interface BehaviorState {
    /**
     * Indicates the entry is queued for update.
     */
    queueEntry?: QueueEntry;

    /**
     * Current synced version.
     */
    version?: number;

    /**
     * Dirty properties.  If queued, these properties are dirty, or if undefined full update is required.
     */
    dirty?: Set<string>;
}

export namespace StateStream {
    /**
     * A single change event.
     *
     * Indicates either property updates or endpoint delete.
     */
    export type Change = Update | Delete;

    /**
     * A serializable version of {@link Change}.
     */
    export type WireChange = WireUpdate | WireDelete;

    export type Key = string;

    export interface Options {
        abort?: Abort.Signal;
        nodes?: Key[];
        clusters?: Key[];
        versions?: KnownVersion[];
        coalesceInterval?: Duration;
    }

    export interface KnownVersion {
        node: Key;
        endpoint: EndpointNumber;
        cluster: Key;
        version: number;
    }

    export interface Update {
        kind: "update";
        node: Node;
        endpoint: Endpoint;
        version: number;
        behavior: Behavior.Type;
        changes: Record<Key, unknown>;
    }

    export interface Delete {
        kind: "delete";
        node: Node;
        endpoint: Endpoint;
    }

    export interface WireUpdate {
        kind: "update";
        node: Key;
        endpoint: number;
        version: number;
        behavior: Key;
        changes: Record<Key, unknown>;
    }

    export interface WireDelete {
        kind: "delete";
        node: Key;
        endpoint: number;
    }

    export function WireChange(change: Change): WireChange {
        switch (change.kind) {
            case "update":
                return {
                    kind: "update",
                    node: change.node.id,
                    endpoint: change.endpoint.number,
                    version: change.version,
                    behavior: change.behavior.id,
                    changes: change.changes,
                };

            case "delete":
                return {
                    kind: "delete",
                    node: change.node.id,
                    endpoint: change.endpoint.number,
                };
        }
    }

    export const OptionsSchema = new DatatypeModel(
        { name: "ChangeOptions", type: "struct", quality: "X" },

        FieldElement({ name: "nodes", type: "list" }, FieldElement({ name: "entry", type: "string" })),
        FieldElement({ name: "clusters", type: "list" }, FieldElement({ name: "entry", type: "string" })),
        FieldElement(
            { name: "versions", type: "list" },

            FieldElement(
                { name: "entry", type: "struct" },

                FieldElement({ name: "node", type: "string", conformance: "M" }),
                FieldElement({ name: "endpoint", type: "endpoint-no", conformance: "M" }),
                FieldElement({ name: "cluster", type: "string", conformance: "M" }),
                FieldElement({ name: "version", type: "data-ver", conformance: "M" }),
            ),
        ),
        FieldElement({ name: "coalesceInterval", type: "duration" }),
    );

    export const WireUpdateSchema = new DatatypeModel(
        { name: "UpdateNotification", type: "struct" },

        FieldElement({ name: "node", type: "string" }),
        FieldElement({ name: "endpoint", type: "endpoint-no" }),
        FieldElement({ name: "version", type: "data-ver" }),
        FieldElement({ name: "cluster", type: "string" }),
        FieldElement({ name: "changes", type: "any" }),
    );

    export const WireDeleteSchema = new DatatypeModel(
        { name: "DeleteNotification", type: "struct" },

        FieldElement({ name: "node", type: "string" }),
        FieldElement({ name: "endpoint", type: "endpoint-no" }),
    );
}
