/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IdentifyCluster } from "@matter/types/clusters";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

export default function commands(theNode: MatterNode) {
    return {
        command: "identify [time] [node-id] [endpoint-id]",
        describe:
            "Trigger Identify command with given time (default 10s). Execute on one node or endpoint, else all onoff clusters will be controlled",
        builder: (yargs: Argv) => {
            return yargs
                .positional("time", {
                    describe: "time in seconds",
                    default: 10,
                    type: "number",
                })
                .positional("node-id", {
                    describe: "node id",
                    default: undefined,
                    type: "string",
                })
                .positional("endpoint-id", {
                    describe: "endpoint id",
                    default: undefined,
                    type: "number",
                });
        },

        handler: async (argv: any) => {
            const { nodeId, time = 10, endpointId } = argv;
            await theNode.iterateNodeDevices(
                await theNode.connectAndGetNodes(nodeId),
                async (device, node) => {
                    const identifyCluster = device.getClusterClient(IdentifyCluster);
                    if (identifyCluster === undefined) {
                        return;
                    }
                    console.log("Invoke Identify for", node.nodeId.toString());
                    await identifyCluster.identify({ identifyTime: time });
                },
                endpointId,
            );
        },
    };
}
