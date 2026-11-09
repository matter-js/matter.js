/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Duration, Millis, ObserverGroup } from "@matter/general";
import { ChangeNotificationService, ClientNode, ClusterBehavior, NodeConnectionState, ServerNode } from "@matter/node";
import { Priority } from "@matter/types";

function occurredAt({ timestamp, timestampKind, resolvedTimestamp }: ChangeNotificationService.OccurrenceProperties) {
    switch (timestampKind) {
        case "epoch":
            return resolvedTimestamp === undefined ? "no timestamp" : epochTime(resolvedTimestamp);
        case "system":
            return resolvedTimestamp === undefined ? "no timestamp" : uptime(resolvedTimestamp);
        case "epoch-delta":
            return resolvedTimestamp === undefined
                ? `${Duration.format(Millis(timestamp))} after the previous event`
                : epochTime(resolvedTimestamp);
        case "system-delta":
            return resolvedTimestamp === undefined
                ? `${Duration.format(Millis(timestamp))} after the previous event, on the device clock`
                : uptime(resolvedTimestamp);
    }
}

function epochTime(ms: number) {
    // The wire type is a uint64 while Date spans ±8.64e15 ms, so a peer can report a time no date renders
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? `epoch + ${ms} ms` : date.toISOString();
}

function uptime(ms: number) {
    return `${Duration.format(Millis(ms))} device uptime`;
}

/** The web UI matches the first word of these labels (shell/webassets/index.html). */
function connectionStateLabel(state: NodeConnectionState) {
    switch (state) {
        case NodeConnectionState.Connected:
            return "connected";
        case NodeConnectionState.Disconnected:
            return "disconnected";
        case NodeConnectionState.Reconnecting:
            return "reconnecting";
        case NodeConnectionState.WaitingForDeviceDiscovery:
            return "waiting for device to be discovered again";
    }
}

/**
 * Wire node-wide diagnostic logging once for the controller and all its peers.
 *
 * Replaces the legacy per-connect `createDiagnosticCallbacks` (attribute/event/state callbacks passed into each
 * `PairedNode.connect`), which the ClientNode API dropped. A single aggregate {@link ChangeNotificationService} stream
 * covers attribute/event changes for every peer, and each peer's connection-state transitions are logged from its
 * lifecycle. Registered handlers are owned by `observers` and torn down when it closes.
 */
export function installDiagnosticLogging(node: ServerNode, observers: ObserverGroup): void {
    observers.on(node.env.get(ChangeNotificationService).change, logChange);

    // Log each commissioned peer's connection-state transitions, torn down when the peer is removed.
    // peers.added/deleted fire for every node in the container (including transient discovery and group nodes),
    // so key the handlers by node to remove them on cull and skip nodes without a peer address.
    const connectionHandlers = new Map<ClientNode, (state: NodeConnectionState) => void>();
    const watchConnection = (peer: ClientNode) => {
        if (connectionHandlers.has(peer)) {
            return;
        }
        const handler = (state: NodeConnectionState) => {
            const nodeId = peer.peerAddress?.nodeId;
            if (nodeId !== undefined) {
                console.log(`Node ${nodeId} ${connectionStateLabel(state)}`);
            }
        };
        connectionHandlers.set(peer, handler);
        peer.lifecycle.connectionStateChanged.on(handler);
    };
    const unwatchConnection = (peer: ClientNode) => {
        const handler = connectionHandlers.get(peer);
        if (handler !== undefined) {
            peer.lifecycle.connectionStateChanged.off(handler);
            connectionHandlers.delete(peer);
        }
    };
    for (const peer of node.peers.commissioned) {
        watchConnection(peer);
    }
    observers.on(node.peers.added, watchConnection);
    observers.on(node.peers.deleted, unwatchConnection);
}

function logChange(change: ChangeNotificationService.Change) {
    const { endpoint } = change;
    const peer = endpoint.ownerOfType(ClientNode.RootEndpoint);
    if (!(peer instanceof ClientNode) || peer.nodeType !== "client" || !peer.lifecycle.isCommissioned) {
        return; // A change on the controller's own node, a group or a discovered node.
    }
    const nodeId = peer.peerAddress?.nodeId;

    switch (change.kind) {
        case "update": {
            const { behavior, properties } = change;
            if (!ClusterBehavior.is(behavior)) {
                break;
            }
            const state = endpoint.stateOf(behavior.id);

            // One line per attribute; the web UI parses this format (shell/webassets/index.html)
            for (const name of properties ?? Object.keys(state)) {
                console.log(
                    `Node ${nodeId}: Attribute ${nodeId}/${endpoint.number}/${behavior.cluster.id}/${name} changed to ${Diagnostic.json(state[name])}`,
                );
            }
            break;
        }
        case "event": {
            const { behavior, event, number, priority, payload } = change;
            if (!ClusterBehavior.is(behavior)) {
                break;
            }
            const when = occurredAt(change);
            console.log(
                `Node ${nodeId}: Event ${nodeId}/${endpoint.number}/${behavior.cluster.id}/${event.propertyName} (#${number}, priority ${Priority[priority]}, at ${when}) triggered with ${Diagnostic.json(payload)}`,
            );
            break;
        }
        case "delete": {
            console.log(`Node ${nodeId}: Endpoint ${endpoint.number} removed`);
            break;
        }
    }
}
