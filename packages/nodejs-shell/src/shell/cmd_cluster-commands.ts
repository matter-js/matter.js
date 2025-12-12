/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, Diagnostic } from "#general";
import { ClusterModel, CommandModel, MatterModel } from "#model";
import { ClusterId, ValidationError } from "#types";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";
import { convertJsonDataWithModel } from "../util/Json.js";

function generateAllCommandHandlersForCluster(yargs: Argv, theNode: MatterNode) {
    MatterModel.standard.clusters.forEach(cluster => {
        yargs = generateClusterCommandHandlers(yargs, cluster, theNode);
    });
    return yargs;
}

function generateClusterCommandHandlers(yargs: Argv, cluster: ClusterModel, theNode: MatterNode) {
    const clusterId = cluster.id;
    if (clusterId === undefined) {
        return yargs;
    }

    yargs = yargs.command(
        [cluster.name.toLowerCase(), `0x${clusterId.toString(16)}`],
        `Invoke ${cluster.name} commands`,
        yargs => {
            cluster.commands.forEach(command => {
                yargs = generateCommandHandler(yargs, clusterId, cluster.name, command, theNode);
            });
            return yargs;
        },
        async (argv: any) => {
            argv.unhandled = true;
        },
    );

    return yargs;
}

function generateCommandHandler(
    yargs: Argv,
    clusterId: number,
    clusterName: string,
    command: CommandModel,
    theNode: MatterNode,
) {
    //console.log("Generating command handler for ", command.name, JSON.stringify(command));
    //console.log(command.definingModel);

    if (command.definingModel !== undefined) {
        // If command has parameters for the call
        return yargs.command(
            [`${command.name.toLowerCase()} <value> <nodeId> <endpointId>`, `0x${command.id.toString(16)}`],
            `Invoke ${clusterName}.${command.name} command`,
            yargs =>
                yargs
                    .positional("value", {
                        describe: "value to write as JSON value",
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
                    }),
            async argv => {
                const { nodeId, endpointId, value } = argv;

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

                await executeCommand(theNode, nodeId, endpointId, clusterId, command, parsedValue);
            },
        );
    }

    // Command has no parameters for the call
    return yargs.command(
        [`${command.name.toLowerCase()} <nodeId> <endpointId>`, `0x${command.id.toString(16)}`],
        `Invoke ${clusterName}.${command.name} command`,
        yargs =>
            yargs
                .positional("node-id", {
                    describe: "node id to write t.",
                    type: "string",
                    demandOption: true,
                })
                .positional("endpoint-id", {
                    describe: "endpoint id to write to",
                    type: "number",
                    demandOption: true,
                }),
        async argv => {
            const { nodeId, endpointId } = argv;
            await executeCommand(theNode, nodeId, endpointId, clusterId, command);
        },
    );
}

async function executeCommand(
    theNode: MatterNode,
    nodeId: string,
    endpointId: number,
    clusterId: number,
    command: CommandModel,
    requestData?: any,
) {
    const commandName = camelize(command.name);

    const node = (await theNode.connectAndGetNodes(nodeId))[0];

    const clusterClient = node.getDeviceById(endpointId)?.getClusterClientById(ClusterId(clusterId));
    if (clusterClient === undefined) {
        console.log(`ERROR: Cluster ${node.nodeId.toString()}/${endpointId}/${clusterId} not found.`);
        return;
    }
    if (clusterClient.commands[commandName] === undefined) {
        console.log(`ERROR: Command ${node.nodeId.toString()}/${endpointId}/${clusterId}/${command.id} not supported.`);
        return;
    }
    try {
        if (requestData !== undefined) {
            requestData = convertJsonDataWithModel(command, requestData);
        }

        const result = await clusterClient.commands[commandName](requestData);
        console.log(
            `Command ${command.name} ${node.nodeId.toString()}/${endpointId}/${clusterId}/${command.id} invoked ${requestData ? `with ${Diagnostic.json(requestData)}` : ""}`,
        );
        if (result !== undefined) {
            console.log(`Result: ${Diagnostic.json(result)}`);
        }
    } catch (error) {
        if (error instanceof ValidationError) {
            console.log(
                `ERROR: Could not validate data for command ${command.name} with ${Diagnostic.json(requestData)}: ${error}${error.fieldName !== undefined ? ` in field ${error.fieldName}` : ""}`,
            );
        } else {
            console.log(
                `ERROR: Could not invoke command ${command.name} ${requestData ? `with ${Diagnostic.json(requestData)}` : ""}: ${error}`,
            );
        }
    }
}

export default function cmdCommands(theNode: MatterNode) {
    return {
        command: ["commands", "c"],
        describe: "Invoke commands",
        builder: (yargs: Argv) => generateAllCommandHandlersForCluster(yargs, theNode),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
