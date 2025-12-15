/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, Diagnostic } from "#general";
import { AttributeModel, ClusterModel, MatterModel } from "#model";
import { AttributeId, ClusterId, EndpointNumber, ValidationError } from "#types";
import { SupportedAttributeClient } from "@project-chip/matter.js/cluster";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";
import { convertJsonDataWithModel } from "../util/Json.js";

function generateAllAttributeHandlersForCluster(yargs: Argv, theNode: MatterNode) {
    MatterModel.standard.clusters.forEach(cluster => {
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
                }),
        async argv => {
            const { nodeId, endpointId, clusterId, attributeId: rawAttributeId } = argv;
            const attributeId = rawAttributeId === "*" ? undefined : parseInt(rawAttributeId);
            const node = (await theNode.connectAndGetNodes(nodeId))[0];

            try {
                const interactionClient = await node.getInteractionClient();
                const result = await interactionClient.getMultipleAttributes({
                    attributes: [
                        {
                            endpointId: EndpointNumber(endpointId),
                            clusterId: ClusterId(clusterId),
                            attributeId: attributeId !== undefined ? AttributeId(attributeId) : undefined,
                        },
                    ],
                });
                console.log(
                    `Attribute values for cluster ${node.nodeId.toString()}/${endpointId}/${clusterId}/${attributeId}:`,
                );
                for (const {
                    path: { attributeId, attributeName },
                    value,
                } of result) {
                    console.log(
                        `    ${Diagnostic.hex(attributeId)}${attributeName !== undefined ? ` (${attributeName})` : ""}: ${Diagnostic.json(value)}`,
                    );
                }
            } catch (error) {
                console.log(
                    `ERROR: Could not get attribute ${node.nodeId.toString()}/${endpointId}/${clusterId}/${attributeId}: ${error}`,
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
                                });
                        },
                        async argv => {
                            const clusterId = cluster.id;
                            const { nodeId, endpointId, remote } = argv;
                            const requestRemote = remote ? true : undefined;
                            const node = (await theNode.connectAndGetNodes(nodeId))[0];

                            const clusterClient = node
                                .getDeviceById(endpointId)
                                ?.getClusterClientById(ClusterId(clusterId!));
                            if (clusterClient === undefined) {
                                console.log(
                                    `ERROR: Cluster ${node.nodeId.toString()}/${endpointId}/${clusterId} not found.`,
                                );
                                return;
                            }
                            console.log(
                                `Attribute values for cluster ${cluster.name} (${node.nodeId.toString()}/${endpointId}/${clusterId}):`,
                            );
                            for (const attribute of cluster.attributes) {
                                const attributeName = camelize(attribute.name);
                                const attributeClient = clusterClient.attributes[attributeName];
                                if (!remote && !(attributeClient instanceof SupportedAttributeClient)) {
                                    continue;
                                }
                                console.log(
                                    `    ${attributeName} (${attribute.id}): ${Diagnostic.json(await attributeClient.get(requestRemote))}`,
                                );
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

function generateAttributeReadHandler(
    yargs: Argv,
    clusterId: number,
    clusterName: string,
    attribute: AttributeModel,
    theNode: MatterNode,
) {
    const attributeName = camelize(attribute.name);
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
                }),
        async argv => {
            const { nodeId, endpointId, remote } = argv;
            const requestRemote = remote ? true : undefined;
            const node = (await theNode.connectAndGetNodes(nodeId))[0];

            const clusterClient = node.getDeviceById(endpointId)?.getClusterClientById(ClusterId(clusterId));
            if (clusterClient === undefined) {
                console.log(`ERROR: Cluster ${node.nodeId.toString()}/${endpointId}/${clusterId} not found.`);
                return;
            }
            const attributeClient = clusterClient.attributes[attributeName];
            if (!remote && !(attributeClient instanceof SupportedAttributeClient)) {
                console.log(
                    `ERROR: Attribute ${node.nodeId.toString()}/${endpointId}/${clusterId}/${attribute.id} not supported by the device.`,
                );
                return;
            }
            try {
                console.log(
                    `Attribute value for ${attributeName} ${node.nodeId.toString()}/${endpointId}/${clusterId}/${attribute.id}: ${Diagnostic.json(await attributeClient.get(requestRemote))}`,
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
    //console.log("Generating attribute handler for ", attribute.name, attribute);
    //console.log(attribute.definingModel);
    const attributeName = camelize(attribute.name);
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

            const node = (await theNode.connectAndGetNodes(nodeId))[0];

            const clusterClient = node.getDeviceById(endpointId)?.getClusterClientById(ClusterId(clusterId));
            if (clusterClient === undefined) {
                console.log(`ERROR: Cluster ${node.nodeId.toString()}/${endpointId}/${clusterId} not found.`);
                return;
            }
            const attributeClient = clusterClient.attributes[attributeName];
            if (!force && !(attributeClient instanceof SupportedAttributeClient)) {
                console.log(
                    `ERROR: Attribute ${node.nodeId.toString()}/${endpointId}/${clusterId}/${attribute.id} not supported by the device.`,
                );
                return;
            }

            try {
                parsedValue = convertJsonDataWithModel(attribute, parsedValue);

                await attributeClient.set(parsedValue);
                console.log(
                    `Attribute ${attributeName} ${node.nodeId.toString()}/${endpointId}/${clusterId}/${attribute.id} set to ${Diagnostic.json(value)}`,
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
