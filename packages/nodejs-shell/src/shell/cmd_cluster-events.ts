/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "@matter/general";
import { ClusterModel, EventModel, Matter } from "@matter/model";
import { ClusterId, EventId } from "@matter/types";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";
import { readEventsRemote, resolveClusterEndpoint } from "../util/ClusterEndpoint.js";

function generateAllEventHandlersForCluster(yargs: Argv, theNode: MatterNode) {
    Matter.clusters.forEach(cluster => {
        yargs = generateClusterEventHandlers(yargs, cluster, theNode);
    });
    return yargs;
}

function generateClusterEventHandlers(yargs: Argv, cluster: ClusterModel, theNode: MatterNode) {
    const clusterId = cluster.id;
    if (clusterId === undefined) {
        return yargs;
    }

    yargs = yargs.command(
        [cluster.name.toLowerCase(), `0x${clusterId.toString(16)}`],
        `Read ${cluster.name} events`,
        yargs => {
            cluster.events.forEach(event => {
                yargs = generateEventHandler(yargs, clusterId, cluster.name, event, theNode);
            });
            return yargs;
        },
        async (argv: any) => {
            argv.unhandled = true;
        },
    );

    return yargs;
}

function generateEventHandler(
    yargs: Argv,
    clusterId: number,
    clusterName: string,
    event: EventModel,
    theNode: MatterNode,
) {
    const eventName = event.propertyName;
    return yargs.command(
        [`${event.name.toLowerCase()} <node-id> <endpoint-id>`, `0x${event.id.toString(16)}`],
        `Read ${clusterName}.${event.name} event`,
        yargs =>
            yargs
                .positional("node-id", {
                    describe: "node id to read",
                    type: "string",
                    demandOption: true,
                })
                .positional("endpoint-id", {
                    describe: "endpoint id to read",
                    type: "number",
                    demandOption: true,
                }),
        async argv => {
            const { nodeId, endpointId } = argv;
            const resolved = await resolveClusterEndpoint(theNode, nodeId, endpointId, clusterId);
            if (resolved === undefined) {
                return;
            }
            const { node, endpoint } = resolved;

            try {
                // No local event cache; every read is a live interaction round trip, same as the legacy EventClient.
                const reports = await readEventsRemote(
                    node,
                    [{ endpointId: endpoint.number, clusterId: ClusterId(clusterId), eventId: EventId(event.id) }],
                    true,
                );
                const events = reports.map(
                    ({
                        number,
                        priority,
                        epochTimestamp,
                        systemTimestamp,
                        deltaEpochTimestamp,
                        deltaSystemTimestamp,
                        value,
                    }) => ({
                        eventNumber: number,
                        priority,
                        epochTimestamp,
                        systemTimestamp,
                        deltaEpochTimestamp,
                        deltaSystemTimestamp,
                        data: value,
                    }),
                );
                console.log(
                    `Event value for ${eventName} ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${event.id}: ${Diagnostic.json(events)}`,
                );
            } catch (error) {
                console.log(`ERROR: Could not get event ${event.name}: ${error}`);
            }
        },
    );
}

export default function cmdEvents(theNode: MatterNode) {
    return {
        command: ["events", "e"],
        describe: "Read events",
        builder: (yargs: Argv) => generateAllEventHandlersForCluster(yargs, theNode),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
