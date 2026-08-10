/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, ObserverGroup } from "@matter/general";
import { NetworkClient } from "@matter/node";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

const watchers = new Map<string, ObserverGroup>();

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

            // Attribute/event/structure changes for every peer are logged node-wide by installDiagnosticLogging
            // (MatterNode.start); this command only establishes the subscription and reports its liveness.

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
