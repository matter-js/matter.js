/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ImplementationError } from "@matter/general";
import { AttributeModel, ClusterModel, Matter } from "@matter/model";
import { AttributeId, ClusterId, ClusterLookup, EndpointNumber, ValidationError } from "@matter/types";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";
import { readAttributesRemote, resolveClusterEndpoint, ResolvedClusterEndpoint } from "../util/ClusterEndpoint.js";
import { convertJsonDataWithModel } from "../util/Json.js";

function generateAllAttributeHandlersForCluster(yargs: Argv, theNode: MatterNode) {
    Matter.clusters.forEach(cluster => {
        yargs = generateClusterAttributeHandlers(yargs, cluster, theNode);
    });

    yargs = yargs.command(
        "by-id <cluster-id> read <attribute-id> <node-id> <endpoint-id>",
        `Read attributes by id`,
        yargs =>
            yargs
                .positional("cluster-id", {
                    describe: "cluster id to read from",
                    type: "number",
                    demandOption: true,
                })
                .positional("attribute-id", {
                    describe: "attribute id to read, use * to read all attributes of the given cluster",
                    type: "string",
                    demandOption: true,
                })
                .positional("node-id", {
                    describe: "node id to read",
                    type: "string",
                    demandOption: true,
                })
                .positional("endpoint-id", {
                    describe: "endpoint id to read",
                    type: "number",
                    demandOption: true,
                })
                .options({
                    "fabric-filtered": {
                        describe: "request fabric-filtered data (only data visible to the accessing fabric)",
                        default: true,
                        type: "boolean",
                    },
                }),
        async argv => {
            const { nodeId, endpointId, clusterId, attributeId: rawAttributeId, fabricFiltered } = argv;
            const attributeId = rawAttributeId === "*" ? undefined : parseInt(rawAttributeId);
            const node = (await theNode.connectAndGetClientNodes(nodeId))[0];

            try {
                const values = await readAttributesRemote(
                    node,
                    [
                        {
                            endpointId: EndpointNumber(endpointId),
                            clusterId: ClusterId(clusterId),
                            attributeId: attributeId !== undefined ? AttributeId(attributeId) : undefined,
                        },
                    ],
                    fabricFiltered,
                );
                console.log(
                    `Attribute values for cluster ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${attributeId}:`,
                );
                for (const {
                    path: { attributeId: id },
                    value,
                } of values) {
                    const attributeName = ClusterLookup.attributeName(ClusterId(clusterId), id, node.matter);
                    console.log(
                        `    ${Diagnostic.hex(id)}${attributeName !== undefined ? ` (${attributeName})` : ""}: ${Diagnostic.json(value)}`,
                    );
                }
            } catch (error) {
                console.log(
                    `ERROR: Could not get attribute ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${attributeId}: ${error}`,
                );
            }
        },
    );
    return yargs;
}

function generateClusterAttributeHandlers(yargs: Argv, cluster: ClusterModel, theNode: MatterNode) {
    const clusterId = cluster.id;
    if (clusterId === undefined) {
        return yargs;
    }

    yargs = yargs.command(
        [cluster.name.toLowerCase(), `0x${clusterId.toString(16)}`],
        `Read/Write ${cluster.name} attributes`,
        yargs => {
            yargs = yargs.command(
                "read",
                `Reads attributes of ${cluster.name}`,
                yargs => {
                    yargs = yargs.command(
                        ["* <node-id> <endpoint-id>", "all"],
                        `Read all attributes of ${cluster.name}`,
                        yargs => {
                            return yargs
                                .positional("node-id", {
                                    describe: "node id to read",
                                    type: "string",
                                    demandOption: true,
                                })
                                .positional("endpoint-id", {
                                    describe: "endpoint id to read",
                                    type: "number",
                                    demandOption: true,
                                })
                                .options({
                                    remote: {
                                        describe:
                                            "request value always remote. Also ignores information about attribute existence on device",
                                        default: false,
                                        type: "boolean",
                                    },
                                    "fabric-filtered": {
                                        describe:
                                            "request fabric-filtered data (only data visible to the accessing fabric)",
                                        default: true,
                                        type: "boolean",
                                    },
                                });
                        },
                        async argv => {
                            const { nodeId, endpointId, remote, fabricFiltered } = argv;
                            const resolved = await resolveClusterEndpoint(theNode, nodeId, endpointId, clusterId!);
                            if (resolved === undefined) {
                                return;
                            }
                            const { node, endpoint, behaviorType } = resolved;

                            console.log(
                                `Attribute values for cluster ${cluster.name} (${node.peerAddress?.nodeId}/${endpointId}/${clusterId}):`,
                            );
                            for (const attribute of cluster.attributes) {
                                const attributeName = attribute.propertyName;
                                if (
                                    !remote &&
                                    !endpoint.behaviors.elementsOf(behaviorType).attributes.has(attributeName)
                                ) {
                                    continue;
                                }
                                try {
                                    console.log(
                                        `    ${attributeName} (${attribute.id}): ${Diagnostic.json(await getAttributeValue(resolved, clusterId!, attribute, remote, fabricFiltered))}`,
                                    );
                                } catch (error) {
                                    console.log(`    ${attributeName} (${attribute.id}): ERROR: ${error}`);
                                }
                            }
                        },
                    );

                    cluster.attributes.forEach(attribute => {
                        yargs = generateAttributeReadHandler(yargs, clusterId, cluster.name, attribute, theNode);
                    });
                    return yargs;
                },
                async (argv: any) => {
                    argv.unhandled = true;
                },
            );

            if (cluster.attributes.some(attribute => attribute.writable)) {
                yargs = yargs.command(
                    "write",
                    `Writes attributes of ${cluster.name}`,
                    yargs => {
                        cluster.attributes.forEach(attribute => {
                            if (!attribute.writable) {
                                return;
                            }
                            yargs = generateAttributeWriteHandler(yargs, clusterId, cluster.name, attribute, theNode);
                        });
                        return yargs;
                    },
                    async (argv: any) => {
                        argv.unhandled = true;
                    },
                );
            }

            return yargs;
        },
        async (argv: any) => {
            argv.unhandled = true;
        },
    );

    return yargs;
}

/** Fetch a single attribute's value: cached behavior state, or a live interaction read when `requestRemote`. */
async function getAttributeValue(
    resolved: ResolvedClusterEndpoint,
    clusterId: number,
    attribute: AttributeModel,
    requestRemote: boolean,
    fabricFiltered: boolean,
): Promise<unknown> {
    const { node, endpoint, behaviorType } = resolved;
    if (requestRemote) {
        const values = await readAttributesRemote(
            node,
            [
                {
                    endpointId: endpoint.number,
                    clusterId: ClusterId(clusterId),
                    attributeId: AttributeId(attribute.id),
                },
            ],
            fabricFiltered,
        );
        if (values.length === 0) {
            throw new ImplementationError(`No value returned for attribute ${attribute.propertyName}`);
        }
        return values[0].value;
    }
    return endpoint.stateOf(behaviorType.id)[attribute.propertyName];
}

function generateAttributeReadHandler(
    yargs: Argv,
    clusterId: number,
    clusterName: string,
    attribute: AttributeModel,
    theNode: MatterNode,
) {
    const attributeName = attribute.propertyName;
    return yargs.command(
        [`${attribute.name.toLowerCase()} <node-id> <endpoint-id>`, `0x${attribute.id.toString(16)}`],
        `Read ${clusterName}.${attribute.name} attribute`,
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
                })
                .options({
                    remote: {
                        describe:
                            "request value always remote. Also ignores information about attribute existence on device",
                        default: false,
                        type: "boolean",
                    },
                    "fabric-filtered": {
                        describe: "request fabric-filtered data (only data visible to the accessing fabric)",
                        default: true,
                        type: "boolean",
                    },
                }),
        async argv => {
            const { nodeId, endpointId, remote, fabricFiltered } = argv;
            const resolved = await resolveClusterEndpoint(theNode, nodeId, endpointId, clusterId);
            if (resolved === undefined) {
                return;
            }
            const { node, endpoint, behaviorType } = resolved;

            if (!remote && !endpoint.behaviors.elementsOf(behaviorType).attributes.has(attributeName)) {
                console.log(
                    `ERROR: Attribute ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${attribute.id} not supported by the device.`,
                );
                return;
            }
            try {
                console.log(
                    `Attribute value for ${attributeName} ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${attribute.id}: ${Diagnostic.json(await getAttributeValue(resolved, clusterId, attribute, remote, fabricFiltered))}`,
                );
            } catch (error) {
                console.log(`ERROR: Could not get attribute ${attribute.name}: ${error}`);
            }
        },
    );
}

function generateAttributeWriteHandler(
    yargs: Argv,
    clusterId: number,
    clusterName: string,
    attribute: AttributeModel,
    theNode: MatterNode,
) {
    const attributeName = attribute.propertyName;
    const typeHint = `${attribute.type}${attribute.definingModel === undefined ? "" : " as JSON string"}`;
    return yargs.command(
        [`${attribute.name.toLowerCase()} <value> <nodeId> <endpointId>`, `0x${attribute.id.toString(16)}`],
        `Write ${clusterName}.${attribute.name} attribute`,
        yargs =>
            yargs
                .positional("value", {
                    describe: `value to write (${typeHint})`,
                    type: "string",
                    demandOption: true,
                })
                .positional("node-id", {
                    describe: "node id to write t.",
                    type: "string",
                    demandOption: true,
                })
                .positional("endpoint-id", {
                    describe: "endpoint id to write to",
                    type: "number",
                    demandOption: true,
                })
                .options({
                    force: {
                        describe: "ignore verification if attribute exists on device",
                        default: false,
                        type: "boolean",
                    },
                }),
        async argv => {
            const { nodeId, endpointId, value, force } = argv;

            let parsedValue: any;
            try {
                parsedValue = JSON.parse(value);
            } catch (error) {
                try {
                    parsedValue = JSON.parse(`"${value}"`);
                } catch (innerError) {
                    console.log(`ERROR: Could not parse value ${value} as JSON.`);
                    return;
                }
            }

            const resolved = await resolveClusterEndpoint(theNode, nodeId, endpointId, clusterId);
            if (resolved === undefined) {
                return;
            }
            const { node, endpoint, behaviorType } = resolved;

            if (!force && !endpoint.behaviors.elementsOf(behaviorType).attributes.has(attributeName)) {
                console.log(
                    `ERROR: Attribute ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${attribute.id} not supported by the device.`,
                );
                return;
            }

            try {
                parsedValue = convertJsonDataWithModel(attribute, parsedValue);

                await endpoint.setStateOf(behaviorType.id, { [attributeName]: parsedValue });
                console.log(
                    `Attribute ${attributeName} ${node.peerAddress?.nodeId}/${endpointId}/${clusterId}/${attribute.id} set to ${Diagnostic.json(value)}`,
                );
            } catch (error) {
                if (error instanceof ValidationError) {
                    console.log(
                        `ERROR: Could not validate data for attribute ${attribute.name} to ${Diagnostic.json(parsedValue)}: ${error}${error.fieldName !== undefined ? ` in field ${error.fieldName}` : ""}`,
                    );
                } else {
                    console.log(
                        `ERROR: Could not set attribute ${attribute.name} to ${Diagnostic.json(parsedValue)}: ${error}`,
                    );
                }
            }
        },
    );
}

export default function cmdAttributes(theNode: MatterNode) {
    return {
        command: ["attributes", "a"],
        describe: "Read and Write attributes",
        builder: (yargs: Argv) => generateAllAttributeHandlersForCluster(yargs, theNode),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
