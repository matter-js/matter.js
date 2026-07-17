/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    capitalize,
    ChannelType,
    decamelize,
    Diagnostic,
    ImplementationError,
    InternalError,
    Logger,
    ServerAddress,
} from "@matter/general";
import {
    ClientNode,
    CommissioningClient,
    NetworkClient,
    NodeConnectionState,
    SoftwareUpdateManager,
} from "@matter/node";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { FabricAuthority, PeerSet } from "@matter/protocol";
import { NodeId } from "@matter/types";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";

const logger = Logger.get("cmd_nodes");

/** Look up a commissioned peer by node id across the controller's default admin fabric. */
function findCommissionedNode(theNode: MatterNode, nodeId: NodeId): ClientNode | undefined {
    return theNode.node.peers.commissioned.find(peer => peer.peerAddress?.nodeId === nodeId);
}

/** Parse a `udp://host:port` / `tcp://host:port` URL (IPv6 host in brackets) into a {@link ServerAddress}. */
function parseFallbackAddress(input: string): ServerAddress {
    const match = /^(udp|tcp):\/\/(.+)$/i.exec(input);
    if (!match) {
        throw new Error(`Invalid address "${input}". Expected udp://<host>:<port> or tcp://<host>:<port>`);
    }
    const type = match[1].toLowerCase() === "tcp" ? "tcp" : "udp";
    const rest = match[2];

    let ip: string;
    let portStr: string;
    if (rest.startsWith("[")) {
        const end = rest.indexOf("]");
        if (end === -1 || rest[end + 1] !== ":") {
            throw new Error(`Invalid IPv6 address "${input}". Expected ${type}://[<ipv6>]:<port>`);
        }
        ip = rest.slice(1, end);
        portStr = rest.slice(end + 2);
    } else {
        const idx = rest.lastIndexOf(":");
        if (idx === -1) {
            throw new Error(`Missing port in "${input}". Expected ${type}://<host>:<port>`);
        }
        ip = rest.slice(0, idx);
        portStr = rest.slice(idx + 1);
    }

    const port = Number(portStr);
    if (!ip.length || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid host/port in "${input}". Expected ${type}://<host>:<port> with port 1-65535`);
    }

    return { ip, port, type };
}

export default function commands(theNode: MatterNode) {
    return {
        command: ["nodes", "node"],
        describe: "Manage nodes",
        builder: (yargs: Argv) =>
            yargs
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
                        const peers = theNode.node.peers.commissioned;
                        switch (status) {
                            case "commissioned": {
                                for (const peer of peers) {
                                    const { addresses, deviceName } = peer.state.commissioning;
                                    console.log({
                                        nodeId: peer.peerAddress?.nodeId.toString(),
                                        operationalAddress: addresses?.length
                                            ? ServerAddress.urlFor(addresses[0])
                                            : undefined,
                                        advertisedName: deviceName,
                                        basicInformation: peer.maybeStateOf(BasicInformationClient),
                                    });
                                }
                                break;
                            }
                            case "connected": {
                                const nodeIds = peers
                                    .filter(peer => peer.lifecycle.isConnected)
                                    .map(peer => peer.peerAddress?.nodeId);
                                console.log(nodeIds.map(nodeId => nodeId?.toString()));
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
                        if (!node.lifecycle.isSeeded) {
                            await node.lifecycle.seeded;
                        }

                        console.log("Logging structure of Node ", node.peerAddress?.nodeId.toString());
                        logger.info(node);
                    },
                )
                .command(
                    "descriptor <node-id>",
                    "Show peer descriptor and transport details for a node",
                    yargs => {
                        return yargs.positional("node-id", {
                            describe: "node id",
                            type: "string",
                            demandOption: true,
                        });
                    },
                    async argv => {
                        const { nodeId: nodeIdStr } = argv;
                        await theNode.start();

                        const nodeId = NodeId(BigInt(nodeIdStr));
                        const peerAddress = findCommissionedNode(theNode, nodeId)?.peerAddress;
                        if (peerAddress === undefined) {
                            console.log(`Node ${nodeIdStr} not commissioned`);
                            return;
                        }
                        const peerSet = theNode.node.env.get(PeerSet);
                        const peer = peerSet.for(peerAddress);

                        if (!peer) {
                            console.log(`Peer ${nodeIdStr} not found`);
                            return;
                        }

                        const desc = peer.descriptor;
                        console.log(`\nPeer Descriptor for node ${nodeIdStr}:`);
                        console.log(`  Address:              ${desc.address}`);
                        console.log(
                            `  Operational Address:  ${desc.operationalAddress ? ServerAddress.urlFor(desc.operationalAddress) : "(unknown)"}`,
                        );
                        console.log(
                            `  Transport Preference: ${peer.transportPreference === ChannelType.TCP ? "TCP" : "UDP (default)"}`,
                        );

                        if (desc.discoveryData) {
                            const dd = desc.discoveryData;
                            console.log(`  Discovery Data:`);
                            if (dd.DN) console.log(`    Device Name:  ${dd.DN}`);
                            if (dd.VP) console.log(`    Vendor/Prod:  ${dd.VP}`);
                            if (dd.DT !== undefined) console.log(`    Device Type:  ${dd.DT}`);
                            if (dd.T !== undefined) {
                                console.log(`    TCP Support:  client=${dd.T.tcpClient}, server=${dd.T.tcpServer}`);
                            } else {
                                console.log(`    TCP Support:  not advertised`);
                            }
                            if (dd.SII) console.log(`    Idle Interval:   ${dd.SII}ms`);
                            if (dd.SAI) console.log(`    Active Interval: ${dd.SAI}ms`);
                        }

                        if (desc.sessionParameters) {
                            const sp = desc.sessionParameters;
                            console.log(`  Session Parameters:`);
                            console.log(`    Supported Transports: ${Diagnostic.json(sp.supportedTransports)}`);
                            if (sp.maxTcpMessageSize !== undefined) {
                                console.log(`    Max TCP Message Size: ${sp.maxTcpMessageSize}`);
                            }
                        }

                        const sessions = [...peer.sessions];
                        if (sessions.length) {
                            console.log(`  Active Sessions: ${sessions.length}`);
                            for (const session of sessions) {
                                console.log(`    ${session.via} (${session.channel.transportChannel.type})`);
                            }
                        } else {
                            console.log(`  Active Sessions: none`);
                        }
                        console.log();
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
                        const autoSubscribe = minSubscriptionInterval !== undefined;

                        // MIGRATION-GAP: shell-diagnostic-callbacks — the legacy per-connect attribute/event/state
                        // diagnostic logging has no equivalent on ConnectClientNodeOptions; a
                        // ChangeNotificationService-backed replacement is filed at
                        // ~/.todos/matter.js/decease-legacy-controller/shell-diagnostic-callbacks.md
                        await theNode.connectAndGetNodes(nodeIdStr !== "all" ? nodeIdStr : undefined, {
                            autoSubscribe,
                            subscribeMinIntervalFloorSeconds: autoSubscribe ? minSubscriptionInterval : undefined,
                            subscribeMaxIntervalCeilingSeconds: autoSubscribe ? maxSubscriptionInterval : undefined,
                        });
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
                        await theNode.start();

                        let nodes = theNode.node.peers.commissioned;
                        if (nodeIdStr !== "all") {
                            const cmdNodeId = NodeId(BigInt(nodeIdStr));
                            nodes = nodes.filter(node => node.peerAddress?.nodeId === cmdNodeId);
                            if (!nodes.length) {
                                throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                            }
                        }

                        for (const node of nodes) {
                            // Stop (not disable): peers stay enabled for on-demand reconnect, and the sweep being off
                            // keeps them disconnected across restarts anyway.
                            await node.stop();
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
                        let nodes = theNode.node.peers.commissioned;
                        if (nodeIdStr !== "all") {
                            const nodeIdList = nodeIdStr.split(",").map(nodeId => NodeId(BigInt(nodeId)));
                            nodes = nodes.filter(
                                node => node.peerAddress !== undefined && nodeIdList.includes(node.peerAddress.nodeId),
                            );
                            if (!nodes.length) {
                                throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                            }
                        }

                        for (const node of nodes) {
                            const basicInfo = node.maybeStateOf(BasicInformationClient);
                            const status = capitalize(
                                decamelize(NodeConnectionState[node.lifecycle.connectionState], " "),
                            );
                            console.log(
                                `Node ${node.peerAddress?.nodeId}: Node Status: ${status}${basicInfo !== undefined ? ` (${basicInfo.vendorName} ${basicInfo.productName})` : ""}`,
                            );
                        }
                    },
                )
                .command(
                    "tcp <node-id> <preference>",
                    "Set TCP transport preference for a node",
                    yargs => {
                        return yargs
                            .positional("node-id", {
                                describe: "node id",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("preference", {
                                describe:
                                    "tcp preference: on (prefer TCP) / off (prefer UDP) / clear (inherit controller default)",
                                choices: ["on", "off", "clear"],
                                demandOption: true,
                                type: "string",
                            });
                    },
                    async argv => {
                        const { nodeId: nodeIdStr, preference } = argv;
                        await theNode.start();

                        const nodeId = NodeId(BigInt(nodeIdStr));
                        const node = findCommissionedNode(theNode, nodeId);
                        if (node === undefined) {
                            throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                        }
                        const peerAddress = node.peerAddress;
                        if (peerAddress === undefined) {
                            throw new ImplementationError(`Node ${nodeIdStr} has no peer address`);
                        }

                        const pref = preference === "on" ? "tcp" : preference === "off" ? "udp" : undefined;
                        await node.setStateOf(NetworkClient, { transportPreference: pref });

                        // Also update the protocol-level peer preference
                        const peer = theNode.node.env.get(PeerSet).for(peerAddress);
                        if (peer) {
                            peer.transportPreference = pref === "tcp" ? ChannelType.TCP : undefined;
                        }

                        console.log(
                            `Transport preference for node ${nodeIdStr} set to ${pref?.toUpperCase() ?? "CLEARED (inherit controller default)"}. Reconnect to the node to take effect.`,
                        );
                    },
                )
                .command(
                    "fallback",
                    "Get or set the fallback (commissioning) addresses used to reach a node",
                    yargs =>
                        yargs
                            .command(
                                "get <node-id>",
                                "Print the fallback addresses currently stored for a node",
                                yargs => {
                                    return yargs.positional("node-id", {
                                        describe: "node id",
                                        type: "string",
                                        demandOption: true,
                                    });
                                },
                                async argv => {
                                    const { nodeId: nodeIdStr } = argv;
                                    await theNode.start();

                                    const nodeId = NodeId(BigInt(nodeIdStr));
                                    const node = findCommissionedNode(theNode, nodeId);
                                    if (node === undefined) {
                                        throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                                    }
                                    const addresses = node.state.commissioning.addresses;

                                    if (!addresses?.length) {
                                        console.log(`Node ${nodeIdStr} has no fallback addresses stored`);
                                        return;
                                    }

                                    console.log(`Fallback addresses for node ${nodeIdStr}:`);
                                    for (const address of addresses) {
                                        console.log(`  ${ServerAddress.urlFor(address)}`);
                                    }
                                },
                            )
                            .command(
                                "set <node-id> <address>",
                                "Set or drop the fallback address for a node (udp://host:port, tcp://host:port, or 'drop')",
                                yargs => {
                                    return yargs
                                        .positional("node-id", {
                                            describe: "node id",
                                            type: "string",
                                            demandOption: true,
                                        })
                                        .positional("address", {
                                            describe: "udp://<host>:<port>, tcp://<host>:<port>, or 'drop' to remove",
                                            type: "string",
                                            demandOption: true,
                                        });
                                },
                                async argv => {
                                    const { nodeId: nodeIdStr, address: addressStr } = argv;
                                    await theNode.start();

                                    const nodeId = NodeId(BigInt(nodeIdStr));
                                    const node = findCommissionedNode(theNode, nodeId);
                                    if (node === undefined) {
                                        throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                                    }

                                    if (addressStr === "drop") {
                                        await node.setStateOf(CommissioningClient, { addresses: undefined });
                                        console.log(`Fallback address for node ${nodeIdStr} dropped`);
                                        return;
                                    }

                                    const address = parseFallbackAddress(addressStr);
                                    await node.setStateOf(CommissioningClient, { addresses: [address] });
                                    console.log(
                                        `Fallback address for node ${nodeIdStr} set to ${ServerAddress.urlFor(address)}`,
                                    );
                                },
                            )
                            .demandCommand(1, "Please specify 'get' or 'set'"),
                    async (argv: any) => {
                        argv.unhandled = true;
                    },
                )
                .command(
                    "add [node-id]",
                    "Adds a node without commissioning and connects to it (means need to exist in the fabric and commissioned otherwise)",
                    yargs => {
                        return yargs
                            .positional("node-id", {
                                describe: "node id to connect.",
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

                        const cmdNodeId = NodeId(BigInt(nodeIdStr));
                        if (findCommissionedNode(theNode, cmdNodeId) !== undefined) {
                            throw new ImplementationError(`Node ${nodeIdStr} already known`);
                        }

                        // Single-fabric shell: the controller's own (first-owned) fabric is the one to address peers on.
                        const fabric = theNode.node.env.get(FabricAuthority).fabrics[0];
                        if (fabric === undefined) {
                            throw new InternalError("No controller fabric present after start");
                        }
                        await theNode.node.peers.forAddress(fabric.addressOf(cmdNodeId));

                        const autoSubscribe = minSubscriptionInterval !== undefined;

                        // MIGRATION-GAP: shell-diagnostic-callbacks — see the `connect` command above; same dropped
                        // per-connect diagnostic logging, same filed todo.
                        await theNode.connectAndGetNodes(nodeIdStr, {
                            autoSubscribe,
                            subscribeMinIntervalFloorSeconds: autoSubscribe ? minSubscriptionInterval : undefined,
                            subscribeMaxIntervalCeilingSeconds: autoSubscribe ? maxSubscriptionInterval : undefined,
                        });
                    },
                )
                .command(
                    "ota",
                    "OTA update operations for nodes",
                    yargs =>
                        yargs
                            .command(
                                "known [node-id]",
                                "List which OTA updates are known to be available for commissioned nodes. Only nodes that are connected and subscribed are considered.",
                                yargs => {
                                    return yargs
                                        .positional("node-id", {
                                            describe: "Node ID to check for updates",
                                            type: "string",
                                            default: undefined,
                                        })
                                        .option("local", {
                                            describe: "include local update files",
                                            type: "boolean",
                                            default: false,
                                        });
                                },
                                async argv => {
                                    const { nodeId: nodeIdStr, local } = argv;

                                    await theNode.start();

                                    let peerToCheck: ClientNode | undefined = undefined;
                                    if (nodeIdStr !== undefined) {
                                        const nodeId = NodeId(BigInt(nodeIdStr));
                                        peerToCheck = findCommissionedNode(theNode, nodeId);
                                        if (peerToCheck === undefined) {
                                            throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                                        }
                                    }

                                    const updatesAvailable = await theNode.otaProviderEndpoint.act(agent =>
                                        agent
                                            .get(SoftwareUpdateManager)
                                            .queryUpdates({ peerToCheck, includeStoredUpdates: local }),
                                    );

                                    if (updatesAvailable.length) {
                                        console.log(`OTA updates available for ${updatesAvailable.length} nodes:`);
                                        for (const { peerAddress, info } of updatesAvailable) {
                                            console.log(
                                                peerAddress.toString(),
                                                `: new Version: ${info.softwareVersion} (${info.softwareVersionString})`,
                                            );
                                        }
                                    } else {
                                        console.log("No OTA updates available.");
                                    }
                                },
                            )
                            .command(
                                "check <node-id>",
                                "Check for OTA updates for a commissioned node",
                                yargs => {
                                    return yargs
                                        .positional("node-id", {
                                            describe: "Node ID to check for updates",
                                            type: "string",
                                            demandOption: true,
                                        })
                                        .option("mode", {
                                            describe: "DCL mode (prod or test)",
                                            type: "string",
                                            choices: ["prod", "test", "both"],
                                            default: "prod",
                                        })
                                        .option("local", {
                                            describe: "include local update files",
                                            type: "boolean",
                                            default: false,
                                        });
                                },
                                async argv => {
                                    const { nodeId: nodeIdStr, mode, local } = argv;
                                    const isProduction = mode === "prod" ? true : mode === "test" ? false : undefined;

                                    await theNode.start();

                                    const nodeId = NodeId(BigInt(nodeIdStr));
                                    const node = findCommissionedNode(theNode, nodeId);
                                    if (node === undefined) {
                                        throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                                    }
                                    const basicInfo = node.maybeStateOf(BasicInformationClient);
                                    if (basicInfo === undefined) {
                                        throw new ImplementationError(
                                            `Node ${nodeIdStr} has no basic information available`,
                                        );
                                    }

                                    console.log(`Checking for OTA updates for node ${nodeIdStr}...`);
                                    console.log(`  Vendor ID: ${Diagnostic.hex(basicInfo.vendorId, 4).toUpperCase()}`);
                                    console.log(
                                        `  Product ID: ${Diagnostic.hex(basicInfo.productId, 4).toUpperCase()}`,
                                    );
                                    console.log(
                                        `  Current Software Version: ${basicInfo.softwareVersion} (${basicInfo.softwareVersionString})`,
                                    );
                                    console.log(`  DCL Mode: ${mode}\n`);

                                    const updateInfo = await (
                                        await theNode.otaService()
                                    ).checkForUpdate({
                                        vendorId: basicInfo.vendorId,
                                        productId: basicInfo.productId,
                                        currentSoftwareVersion: basicInfo.softwareVersion,
                                        includeStoredUpdates: local,
                                        isProduction,
                                    });

                                    if (updateInfo) {
                                        console.log("✓ Update available!");
                                        console.log(
                                            `  New Version: ${updateInfo.softwareVersion} (${updateInfo.softwareVersionString})`,
                                        );
                                        console.log(`  OTA URL: ${updateInfo.otaUrl}`);
                                        if (updateInfo.otaFileSize) {
                                            const sizeKB = Number(updateInfo.otaFileSize) / 1024;
                                            console.log(`  File Size: ${sizeKB.toFixed(2)} KB`);
                                        }
                                        if (updateInfo.releaseNotesUrl) {
                                            console.log(`  Release Notes: ${updateInfo.releaseNotesUrl}`);
                                        }
                                        console.log(
                                            `\nRun "nodes ota download ${nodeIdStr}${mode === "test" ? " --mode test" : ""}" to download this update.`,
                                        );
                                    } else {
                                        console.log("✓ No updates available. Device is up to date.");
                                    }
                                },
                            )
                            .command(
                                "download <node-id>",
                                "Download OTA update for a commissioned node",
                                yargs => {
                                    return yargs
                                        .positional("node-id", {
                                            describe: "Node ID to download update for",
                                            type: "string",
                                            demandOption: true,
                                        })
                                        .option("mode", {
                                            describe: "DCL mode (prod or test)",
                                            type: "string",
                                            choices: ["prod", "test", "both"],
                                            default: "prod",
                                        })
                                        .option("force", {
                                            describe: "Force download even if update is already stored locally",
                                            type: "boolean",
                                            default: false,
                                        })
                                        .option("local", {
                                            describe: "include local update files",
                                            type: "boolean",
                                            default: false,
                                        });
                                },
                                async argv => {
                                    const { nodeId: nodeIdStr, mode, force, local } = argv;
                                    const isProduction = mode === "prod" ? true : mode === "test" ? false : undefined;
                                    const forceDownload = force === true;

                                    await theNode.start();

                                    const nodeId = NodeId(BigInt(nodeIdStr));
                                    const node = findCommissionedNode(theNode, nodeId);
                                    if (node === undefined) {
                                        throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                                    }
                                    const basicInfo = node.maybeStateOf(BasicInformationClient);
                                    if (basicInfo === undefined) {
                                        throw new ImplementationError(
                                            `Node ${nodeIdStr} has no basic information available`,
                                        );
                                    }

                                    console.log(`Checking for OTA updates for node ${nodeIdStr}...`);
                                    console.log(`  Vendor ID: ${Diagnostic.hex(basicInfo.vendorId, 4).toUpperCase()}`);
                                    console.log(
                                        `  Product ID: ${Diagnostic.hex(basicInfo.productId, 4).toUpperCase()}`,
                                    );
                                    console.log(
                                        `  Current Software Version: ${basicInfo.softwareVersion} (${basicInfo.softwareVersionString})`,
                                    );
                                    console.log(`  DCL Mode: ${mode}\n`);

                                    const updateInfo = await (
                                        await theNode.otaService()
                                    ).checkForUpdate({
                                        vendorId: basicInfo.vendorId,
                                        productId: basicInfo.productId,
                                        currentSoftwareVersion: basicInfo.softwareVersion,
                                        includeStoredUpdates: local,
                                        isProduction,
                                    });

                                    if (!updateInfo) {
                                        console.log("No updates available. Device is up to date.");
                                        return;
                                    }

                                    console.log("Update found:");
                                    console.log(
                                        `  New Version: ${updateInfo.softwareVersion} (${updateInfo.softwareVersionString})`,
                                    );
                                    console.log(`  OTA URL: ${updateInfo.otaUrl}`);
                                    console.log(`  Source: ${updateInfo.source}`);
                                    if (updateInfo.otaFileSize) {
                                        const sizeKB = Number(updateInfo.otaFileSize) / 1024;
                                        console.log(`  File Size: ${sizeKB.toFixed(2)} KB`);
                                    }

                                    console.log("\nDownloading update...");
                                    const fd = await (
                                        await theNode.otaService()
                                    ).downloadUpdate(updateInfo, forceDownload);

                                    console.log(`✓ Update downloaded and stored successfully: ${fd.text}`);
                                    console.log(
                                        `\nYou can now apply this update to the device using your device's OTA mechanism.`,
                                    );
                                },
                            )
                            .command(
                                "apply <node-id>",
                                "Apply OTA update for a commissioned node",
                                yargs => {
                                    return yargs
                                        .positional("node-id", {
                                            describe: "Node ID to download update for",
                                            type: "string",
                                            demandOption: true,
                                        })
                                        .option("mode", {
                                            describe: "DCL mode (prod or test)",
                                            type: "string",
                                            choices: ["prod", "test", "both"],
                                            default: "prod",
                                        })
                                        .option("force", {
                                            describe: "Force download even if update is already stored locally",
                                            type: "boolean",
                                            default: false,
                                        })
                                        .option("local", {
                                            describe: "Apply update from local file",
                                            type: "boolean",
                                            default: false,
                                        });
                                },
                                async argv => {
                                    const { nodeId: nodeIdStr, mode, force, local } = argv;
                                    const isProduction = mode === "prod" ? true : mode === "test" ? false : undefined;
                                    const forceDownload = force === true;

                                    await theNode.start();

                                    const nodeId = NodeId(BigInt(nodeIdStr));
                                    const node = findCommissionedNode(theNode, nodeId);
                                    if (node === undefined) {
                                        throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                                    }
                                    const basicInfo = node.maybeStateOf(BasicInformationClient);
                                    if (basicInfo === undefined) {
                                        throw new ImplementationError(
                                            `Node ${nodeIdStr} has no basic information available`,
                                        );
                                    }

                                    console.log(`Checking for OTA updates for node ${nodeIdStr}...`);
                                    console.log(`  Vendor ID: ${Diagnostic.hex(basicInfo.vendorId, 4).toUpperCase()}`);
                                    console.log(
                                        `  Product ID: ${Diagnostic.hex(basicInfo.productId, 4).toUpperCase()}`,
                                    );
                                    console.log(
                                        `  Current Software Version: ${basicInfo.softwareVersion} (${basicInfo.softwareVersionString})`,
                                    );
                                    console.log(`  DCL Mode: ${mode}\n`);

                                    const localUpdates = await (
                                        await theNode.otaService()
                                    ).find({
                                        vendorId: basicInfo.vendorId,
                                        productId: basicInfo.productId,
                                        currentVersion: basicInfo.softwareVersion,
                                    });

                                    if (local && !localUpdates.length) {
                                        console.log("No applicable updates available in local storage.");
                                        return;
                                    }

                                    const updateInfo = await (
                                        await theNode.otaService()
                                    ).checkForUpdate({
                                        vendorId: basicInfo.vendorId,
                                        productId: basicInfo.productId,
                                        currentSoftwareVersion: basicInfo.softwareVersion,
                                        includeStoredUpdates: local,
                                        isProduction,
                                    });

                                    let updateVersion: number;
                                    if (!updateInfo && !local) {
                                        console.log("No updates available in DCL. Device is up to date.");
                                        return;
                                    } else if (updateInfo) {
                                        console.log("Update found:");
                                        console.log(
                                            `  New Version: ${updateInfo.softwareVersion} (${updateInfo.softwareVersionString})`,
                                        );
                                        console.log(`  OTA URL: ${updateInfo.otaUrl}`);
                                        if (updateInfo.otaFileSize) {
                                            const sizeKB = Number(updateInfo.otaFileSize) / 1024;
                                            console.log(`  File Size: ${sizeKB.toFixed(2)} KB`);
                                        }

                                        console.log("\nDownloading update...");
                                        const fd = await (
                                            await theNode.otaService()
                                        ).downloadUpdate(updateInfo, forceDownload);

                                        updateVersion = updateInfo.softwareVersion;

                                        console.log(
                                            `✓ Update to version ${updateVersion} (${updateInfo.softwareVersionString}) downloaded and stored successfully: ${fd.text}`,
                                        );
                                    } else {
                                        updateVersion = localUpdates[0].softwareVersion;
                                        console.log(
                                            `Update to version ${updateVersion} (${localUpdates[0].softwareVersionString}) found in local storage: ${localUpdates[0].filename}`,
                                        );
                                    }

                                    if (!node.lifecycle.isConnected) {
                                        throw new ImplementationError(`Node ${nodeIdStr} not connected`);
                                    }
                                    const peerAddress = node.peerAddress;
                                    if (peerAddress === undefined) {
                                        throw new ImplementationError(`Node ${nodeIdStr} has no peer address`);
                                    }

                                    await theNode.otaProviderEndpoint.act(agent => {
                                        return agent
                                            .get(SoftwareUpdateManager)
                                            .forceUpdate(
                                                peerAddress,
                                                basicInfo.vendorId,
                                                basicInfo.productId,
                                                updateVersion,
                                            );
                                    });
                                },
                            )
                            .demandCommand(1, "Please specify an OTA subcommand"),
                    async (argv: any) => {
                        argv.unhandled = true;
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
