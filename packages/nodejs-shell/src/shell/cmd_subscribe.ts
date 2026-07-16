/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ImplementationError, ObserverGroup } from "@matter/general";
import { ChangeNotificationService, ClusterBehavior, Endpoint, NetworkClient } from "@matter/node";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

const watchers = new Map<string, ObserverGroup>();

/** True if `endpoint` belongs to `node`'s endpoint tree (the node itself is its own root endpoint). */
function ownedBy(endpoint: Endpoint, node: Endpoint) {
    for (let e: Endpoint | undefined = endpoint; e !== undefined; e = e.owner) {
        if (e === node) {
            return true;
        }
    }
    return false;
}

export default function commands(theNode: MatterNode) {
    return {
        command: "subscribe [node-id]",
        describe: "Subscribe to all events and attributes of a node",
        builder: (yargs: Argv) => {
            return yargs.positional("node-id", {
                describe: "node id",
                default: undefined,
                type: "string",
            });
        },

        handler: async (argv: any) => {
            const { nodeId: subscribeNodeId } = argv;
            const node = (await theNode.connectAndGetNodes(subscribeNodeId))[0];
            if (node === undefined) {
                throw new ImplementationError("No commissioned node to subscribe to");
            }
            const nodeId = node.peerAddress?.nodeId;
            if (nodeId === undefined) {
                throw new ImplementationError("Resolved node has no peer address to subscribe to");
            }
            const key = String(nodeId);

            // Re-subscribing the same node replaces its watcher so change lines are not logged twice.
            watchers.get(key)?.close();
            watchers.delete(key);
            const observers = new ObserverGroup();
            watchers.set(key, observers);
            observers.on(node.lifecycle.destroyed, () => {
                watchers.get(key)?.close();
                watchers.delete(key);
            });

            // ChangeNotificationService is one aggregate stream for the controller node and *all* its peers, so
            // restrict to the endpoint tree of the node this command targets.
            observers.on(theNode.node.env.get(ChangeNotificationService).change, change => {
                const { endpoint } = change;
                if (!ownedBy(endpoint, node)) {
                    return;
                }

                switch (change.kind) {
                    case "update": {
                        const { behavior, properties, version } = change;
                        if (!ClusterBehavior.is(behavior)) {
                            break;
                        }
                        const state = endpoint.stateOf(behavior.id);
                        const changed =
                            properties === undefined
                                ? state
                                : Object.fromEntries(properties.map(name => [name, state[name]]));
                        console.log(
                            `${nodeId}: Attribute ${endpoint.number}/${behavior.cluster.id} changed to ${Diagnostic.json(changed)} (version ${version})`,
                        );
                        break;
                    }
                    case "event": {
                        const { behavior, event, number, timestamp, priority, payload } = change;
                        if (!ClusterBehavior.is(behavior)) {
                            break;
                        }
                        console.log(
                            `${nodeId}: Event ${endpoint.number}/${behavior.cluster.id}/${event.propertyName} (#${number}, priority ${priority}, at ${timestamp}) triggered with ${Diagnostic.json(payload)}`,
                        );
                        break;
                    }
                    case "delete": {
                        console.log(`${nodeId}: Endpoint ${endpoint.number} removed`);
                        break;
                    }
                }
            });

            // Surface subscription liveness transitions (establishment, drop, re-establishment).
            observers.on(node.eventsOf(NetworkClient).subscriptionStatusChanged, isActive => {
                console.log(`${nodeId}: subscription ${isActive ? "active" : "inactive"}`);
            });

            // Enabling auto-subscribe establishes (and thereafter re-establishes) the sustained subscription; changes
            // flow to the already-registered listener above.
            await node.set({ network: { autoSubscribe: true } });

            const subscriptionActive = await node.act(agent => agent.get(NetworkClient).subscriptionActive);
            console.log(
                `Subscribed to node ${nodeId} (subscription active: ${subscriptionActive}). Attribute and event changes will be logged below as they arrive.`,
            );
        },
    };
}
