/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Node } from "#node/Node.js";
import { ServerNode } from "#node/ServerNode.js";
import { Abort, deepCopy, Duration, Gate, Millis, Timer } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import { EndpointNumber } from "@matter/types";
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

            // A node that is not readable yet is sent once its root reports readable
            for (const target of [node, ...node.peers]) {
                if (target.lifecycle.isReadable) {
                    enqueueNode(target);
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

                    // Dropped state is sent in full when the endpoint reports readable again
                    if (!endpoint.lifecycle.isReadable) {
                        continue;
                    }

                    stateOfEndpoint(node.id, endpoint.number).announced = true;

                    let changes: Record<string, unknown>;
                    if (state.dirty) {
                        const allState = endpoint.stateOf(behavior) as Record<string, unknown>;
                        changes = {};
                        for (const name of state.dirty) {
                            changes[name] = deepCopy(allState[name]);
                        }
                        state.dirty = undefined;
                    } else {
                        changes = deepCopy(endpoint.stateOf(behavior));
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
     * Enqueue all state of a node.
     */
    function enqueueNode(target: Node) {
        for (const endpoint of target.endpoints) {
            enqueueEndpoint(target, endpoint);
        }
    }

    /**
     * Enqueue all state of an endpoint.
     */
    function enqueueEndpoint(node: Node, endpoint: Endpoint) {
        for (const behavior of Object.values(endpoint.behaviors.supported)) {
            if (filter && !filter(node.id, behavior.id)) {
                continue;
            }
            const behaviorState = stateFor(node, endpoint, behavior);
            behaviorState.dirty = undefined;
            if (!behaviorState.queueEntry) {
                enqueue((behaviorState.queueEntry = { node, endpoint, behavior }));
            }
        }
    }

    /**
     * Process a notification that an endpoint's state became readable.
     *
     * A node root becomes readable after its parts, so a stream that began in between has not seen the parts either.
     */
    function enqueueReadable({ endpoint }: ChangeNotificationService.EndpointReadable) {
        const node = endpoint.env.get(Node);
        if (endpoint === node) {
            enqueueNode(node);
        } else {
            enqueueEndpoint(node, endpoint);
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

            case "readable":
                enqueueReadable(change);
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
            nodeState.set(endpoint, (endpointState = { behaviors: new Map(), endpoint: undefined, announced: false }));
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
            endpointState.behaviors.set(
                behavior,
                (behaviorState = {
                    queueEntry: undefined,
                    version: undefined,
                    dirty: undefined,
                }),
            );
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
            stateOfEndpoint(node, endpoint).announced = true;
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

        const behaviorState = stateFor(node, endpoint, behavior);

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

        if (endpoint === node) {
            const nodeState = nodes.get(node.id);
            nodes.delete(node.id);
            let announced = false;
            for (const endpointState of nodeState?.values() ?? []) {
                dequeueAll(endpointState);
                announced ||= endpointState.announced;
            }
            if (announced) {
                enqueue({ endpoint, node });
            }
            return;
        }

        // Only retract what this stream knows of this endpoint; another endpoint may hold the number
        const nodeState = nodes.get(node.id);
        const endpointState = nodeState?.get(endpoint.number);
        // An endpoint known only from the consumer's versions has no holder recorded yet
        if (
            nodeState === undefined ||
            endpointState === undefined ||
            (endpointState.endpoint !== undefined && endpointState.endpoint !== endpoint)
        ) {
            return;
        }

        dequeueAll(endpointState);
        nodeState.delete(endpoint.number);

        if (endpointState.announced) {
            enqueue({ endpoint, node });
        }
    }

    /**
     * Dequeue all entries associated with an endpoint.
     */
    function dequeueAll(endpointState: EndpointState) {
        for (const { queueEntry } of endpointState.behaviors.values()) {
            if (queueEntry) {
                dequeue(queueEntry);
            }
        }
    }

    /**
     * Access the {@link BehaviorState} of a live endpoint, recording that endpoint as the holder of its number.
     */
    function stateFor(node: Node, endpoint: Endpoint, behavior: Behavior.Type) {
        const endpointState = stateOfEndpoint(node.id, endpoint.number);
        if (endpointState.endpoint !== endpoint) {
            // What was tracked under the number belongs to the endpoint that held it before
            if (endpointState.endpoint !== undefined) {
                dequeueAll(endpointState);
                endpointState.behaviors.clear();
            }
            endpointState.endpoint = endpoint;
        }
        return stateOfBehavior(node.id, endpoint.number, behavior.id);
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

    /**
     * The endpoint whose changes this state tracks.
     */
    endpoint: Endpoint | undefined;

    /**
     * Indicates the consumer knows of the endpoint, so its deletion must be reported.
     */
    announced: boolean;
}

interface BehaviorState {
    /**
     * Indicates the entry is queued for update.
     */
    queueEntry: QueueEntry | undefined;

    /**
     * Current synced version.
     */
    version: number | undefined;

    /**
     * Dirty properties.  If queued, these properties are dirty, or if undefined full update is required.
     */
    dirty: Set<string> | undefined;
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
