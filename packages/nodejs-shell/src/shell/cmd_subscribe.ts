/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#general";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

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

            await node.subscribeAllAttributesAndEvents({
                attributeChangedCallback: ({ path: { nodeId, clusterId, endpointId, attributeName }, value }) =>
                    console.log(
                        `${subscribeNodeId}: Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Diagnostic.json(
                            value,
                        )}`,
                    ),
                eventTriggeredCallback: ({ path: { nodeId, clusterId, endpointId, eventName }, events }) =>
                    console.log(
                        `${subscribeNodeId} Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Diagnostic.json(
                            events,
                        )}`,
                    ),
            });
        },
    };
}
