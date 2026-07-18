/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ObserverGroup } from "@matter/general";
import {
    ChangeNotificationService,
    ClientNode,
    ClusterBehavior,
    Endpoint,
    NodeConnectionState,
    ServerNode,
} from "@matter/node";

/** True if `endpoint` belongs to `node`'s endpoint tree (the node itself is its own root endpoint). */
function ownedBy(endpoint: Endpoint, node: Endpoint) {
    for (let e: Endpoint | undefined = endpoint; e !== undefined; e = e.owner) {
        if (e === node) {
            return true;
        }
    }
    return false;
}

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
    observers.on(node.env.get(ChangeNotificationService).change, change => {
        const { endpoint } = change;
        const peer = node.peers.commissioned.find(peer => ownedBy(endpoint, peer));
        if (peer === undefined) {
            return; // A change on the controller's own node, not a peer.
        }
        const nodeId = peer.peerAddress?.nodeId;

        switch (change.kind) {
            case "update": {
                const { behavior, properties, version } = change;
                if (!ClusterBehavior.is(behavior)) {
                    break;
                }
                const state = endpoint.stateOf(behavior.id);
                const changed =
                    properties === undefined ? state : Object.fromEntries(properties.map(name => [name, state[name]]));
                console.log(
                    `Node ${nodeId}: Attribute ${endpoint.number}/${behavior.cluster.id} changed to ${Diagnostic.json(changed)} (version ${version})`,
                );
                break;
            }
            case "event": {
                const { behavior, event, number, timestamp, priority, payload } = change;
                if (!ClusterBehavior.is(behavior)) {
                    break;
                }
                console.log(
                    `Node ${nodeId}: Event ${endpoint.number}/${behavior.cluster.id}/${event.propertyName} (#${number}, priority ${priority}, at ${timestamp}) triggered with ${Diagnostic.json(payload)}`,
                );
                break;
            }
            case "delete": {
                console.log(`Node ${nodeId}: Endpoint ${endpoint.number} removed`);
                break;
            }
        }
    });

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
