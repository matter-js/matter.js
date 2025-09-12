/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { capitalize, decamelize, Diagnostic } from "#general";
import { NodeId } from "#types";
import { CommissioningControllerNodeOptions, NodeStateInformation } from "@project-chip/matter.js/device";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode";

export function createDiagnosticCallbacks(): Partial<CommissioningControllerNodeOptions> {
    return {
        attributeChangedCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, attributeName }, value }) =>
            console.log(
                `attributeChangedCallback ${peerNodeId}: Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Diagnostic.json(
                    value,
                )}`,
            ),
        eventTriggeredCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, eventName }, events }) =>
            console.log(
                `eventTriggeredCallback ${peerNodeId}: Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Diagnostic.json(
                    events,
                )}`,
            ),
        stateInformationCallback: (peerNodeId, info) => {
            switch (info) {
                case NodeStateInformation.Connected:
                    console.log(`stateInformationCallback Node ${peerNodeId} connected`);
                    break;
                case NodeStateInformation.Disconnected:
                    console.log(`stateInformationCallback Node ${peerNodeId} disconnected`);
                    break;
                case NodeStateInformation.Reconnecting:
                    console.log(`stateInformationCallback Node ${peerNodeId} reconnecting`);
                    break;
                case NodeStateInformation.WaitingForDeviceDiscovery:
                    console.log(
                        `stateInformationCallback Node ${peerNodeId} waiting that device gets discovered again`,
                    );
                    break;
                case NodeStateInformation.StructureChanged:
                    console.log(`stateInformationCallback Node ${peerNodeId} structure changed`);
                    break;
                case NodeStateInformation.Decommissioned:
                    console.log(`stateInformationCallback Node ${peerNodeId} decommissioned`);
                    break;
            }
        },
    };
}

export default function commands(theNode: MatterNode) {
    return {
        command: ["nodes", "node"],
        describe: "Manage nodes",
        builder: (yargs: Argv) =>
            yargs
                // Pair
                .command(
                    ["*", "list [status]"],
                    "List all commissioned nodes",
                    yargs => {
                        return yargs.positional("status", {
                            describe: "status",
                            options: ["commissioned", "connected"] as const,
                            default: "commissioned",
                            type: "string",
                        });
                    },
                    async argv => {
                        const { status } = argv;
                        await theNode.start();
                        if (theNode.commissioningController === undefined) {
                            throw new Error("CommissioningController not initialized");
                        }
                        switch (status) {
                            case "commissioned": {
                                const details = theNode.commissioningController.getCommissionedNodesDetails();
                                details
                                    .map(detail => ({
                                        ...detail,
                                        nodeId: detail.nodeId.toString(),
                                    }))
                                    .forEach(detail => {
                                        console.log(detail);
                                    });
                                break;
                            }
                            case "connected": {
                                const nodeIds = theNode.commissioningController
                                    .getCommissionedNodes()
                                    .filter(nodeId => !!theNode.commissioningController?.getPairedNode(nodeId));
                                console.log(nodeIds.map(nodeId => nodeId.toString()));
                                break;
                            }
                        }
                    },
                )
                .command(
                    "log [node-id]",
                    "Log the Structure of one node",
                    yargs => {
                        return yargs.positional("node-id", {
                            describe: "node id to log - if omitted the first node is logged.",
                            default: undefined,
                            type: "string",
                        });
                    },
                    async argv => {
                        const { nodeId } = argv;
                        const node = (await theNode.connectAndGetNodes(nodeId))[0];

                        console.log("Logging structure of Node ", node.nodeId.toString());
                        node.logStructure();
                    },
                )
                .command(
                    "connect [node-id] [min-subscription-interval] [max-subscription-interval]",
                    "Connects to one or all commissioned nodes",
                    yargs => {
                        return yargs
                            .positional("node-id", {
                                describe: "node id to connect. Use 'all' to connect to all nodes.",
                                default: "all",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("min-subscription-interval", {
                                describe:
                                    "Minimum subscription interval in seconds. If set then the node is subscribed to all attributes and events.",
                                type: "number",
                            })
                            .positional("max-subscription-interval", {
                                describe:
                                    "Maximum subscription interval in seconds. If minimum interval is set and this not it will be determined automatically.",
                                type: "number",
                            });
                    },
                    async argv => {
                        const { nodeId: nodeIdStr, maxSubscriptionInterval, minSubscriptionInterval } = argv;
                        await theNode.start();
                        if (theNode.commissioningController === undefined) {
                            throw new Error("CommissioningController not initialized");
                        }
                        let nodeIds = theNode.commissioningController.getCommissionedNodes();
                        if (nodeIdStr !== "all") {
                            const cmdNodeId = NodeId(BigInt(nodeIdStr));
                            nodeIds = nodeIds.filter(nodeId => nodeId === cmdNodeId);
                            if (!nodeIds.length) {
                                throw new Error(`Node ${nodeIdStr} not commissioned`);
                            }
                        }

                        const autoSubscribe = minSubscriptionInterval !== undefined;

                        for (const nodeIdToProcess of nodeIds) {
                            const node = await theNode.commissioningController.getNode(nodeIdToProcess);
                            node.connect({
                                autoSubscribe,
                                subscribeMinIntervalFloorSeconds: autoSubscribe ? minSubscriptionInterval : undefined,
                                subscribeMaxIntervalCeilingSeconds: autoSubscribe ? maxSubscriptionInterval : undefined,
                                ...createDiagnosticCallbacks(),
                            });
                        }
                    },
                )
                .command(
                    "disconnect [node-id]",
                    "Disconnects from one or all nodes",
                    yargs => {
                        return yargs.positional("node-id", {
                            describe: "node id to disconnect. Use 'all' to disconnect from all nodes.",
                            default: "all",
                            type: "string",
                        });
                    },
                    async argv => {
                        const { nodeId: nodeIdStr } = argv;
                        if (theNode.commissioningController === undefined) {
                            console.log("Controller not initialized, nothing to disconnect.");
                            return;
                        }

                        let nodeIds = theNode.commissioningController.getCommissionedNodes();
                        if (nodeIdStr !== "all") {
                            const cmdNodeId = NodeId(BigInt(nodeIdStr));
                            nodeIds = nodeIds.filter(nodeId => nodeId === cmdNodeId);
                            if (!nodeIds.length) {
                                throw new Error(`Node ${nodeIdStr} not commissioned`);
                            }
                        }

                        for (const nodeIdToProcess of nodeIds) {
                            const node = theNode.commissioningController.getPairedNode(nodeIdToProcess);
                            if (node === undefined) {
                                console.log(`Node ${nodeIdToProcess} not connected`);
                                continue;
                            }
                            await node.disconnect();
                        }
                    },
                )
                .command(
                    "status [node-ids]",
                    "Logs the connection status for all or specified nodes",
                    yargs => {
                        return yargs.positional("node-ids", {
                            describe:
                                "node ids to connect (comma separated list allowed). Use 'all' to log status for all nodes.",
                            default: "all",
                            type: "string",
                        });
                    },
                    async argv => {
                        const { nodeIds: nodeIdStr } = argv;
                        await theNode.start();
                        if (theNode.commissioningController === undefined) {
                            throw new Error("CommissioningController not initialized");
                        }
                        let nodeIds = theNode.commissioningController.getCommissionedNodes();
                        if (nodeIdStr !== "all") {
                            const nodeIdList = nodeIdStr.split(",").map(nodeId => NodeId(BigInt(nodeId)));
                            nodeIds = nodeIds.filter(nodeId => nodeIdList.includes(nodeId));
                            if (!nodeIds.length) {
                                throw new Error(`Node ${nodeIdStr} not commissioned`);
                            }
                        }

                        for (const nodeIdToProcess of nodeIds) {
                            const node = theNode.commissioningController.getPairedNode(nodeIdToProcess);
                            if (node === undefined) {
                                console.log(`Node ${nodeIdToProcess}: Not initialized`);
                            } else {
                                const basicInfo = node.basicInformation;
                                console.log(
                                    `Node ${nodeIdToProcess}: Node Status: ${capitalize(decamelize(NodeStateInformation[node.connectionState], " "))}${basicInfo !== undefined ? ` (${basicInfo.vendorName} ${basicInfo.productName})` : ""}`,
                                );
                            }
                        }
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
