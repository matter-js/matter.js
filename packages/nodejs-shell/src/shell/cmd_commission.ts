/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, ImplementationError, Logger, Seconds } from "@matter/general";
import { ClientNode, CommissioningClient } from "@matter/node";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { DescriptorClient } from "@matter/node/behaviors/descriptor";
import { DiscoveryCapabilitiesSchema, ManualPairingCodeCodec, NodeId, QrCode, QrPairingCodeCodec } from "@matter/types";
import { GeneralCommissioning } from "@matter/types/clusters";
import type { Argv } from "yargs";
import { MatterNode } from "../MatterNode.js";
import { awaitSeeded } from "../util/awaitSeeded.js";

const logger = Logger.get("Commission");

/** Look up a commissioned peer by node id across the controller's default admin fabric. */
function findCommissionedNode(theNode: MatterNode, nodeId: NodeId): ClientNode | undefined {
    return theNode.node.peers.commissioned.find(peer => peer.peerAddress?.nodeId === nodeId);
}

export default function commands(theNode: MatterNode) {
    return {
        command: "commission",
        describe: "Handle device commissioning",
        builder: (yargs: Argv) =>
            yargs
                // Pair
                .command("pair", "Pair with a matter device", yargs => {
                    return (
                        yargs
                            // Options are registered before the command below so their types flow into its handler's argv.
                            .options({
                                pairingCode: {
                                    describe: "pairing code",
                                    default: undefined,
                                    type: "string",
                                },
                                qrCode: {
                                    describe: "QR code string (MT:...)",
                                    default: undefined,
                                    type: "string",
                                },
                                qrCodeIndex: {
                                    describe: "Index of QR code entry if multiple (1..n)",
                                    default: 1,
                                    type: "number",
                                },
                                setupPinCode: {
                                    describe: "setup pin code",
                                    default: 20202021,
                                    type: "number",
                                },
                                instanceId: {
                                    alias: "i",
                                    describe: "instance id",
                                    type: "string",
                                },
                                discriminator: {
                                    alias: "d",
                                    description: "Long discriminator",
                                    type: "number",
                                },
                                shortDiscriminator: {
                                    alias: "s",
                                    description: "Short discriminator",
                                    type: "number",
                                },
                                ble: {
                                    alias: "b",
                                    description: "Also discover over BLE",
                                    type: "boolean",
                                    default: false,
                                },
                            })
                            // Pair
                            .command(
                                "* [node-id] [ip] [port]",
                                "Commission a matter device",
                                yargs => {
                                    return yargs
                                        .positional("node-id", {
                                            describe: "node id",
                                            default: undefined,
                                            type: "string",
                                        })
                                        .positional("ip", {
                                            describe: "ip address",
                                            default: undefined,
                                            type: "string",
                                        })
                                        .positional("port", {
                                            describe: "ip port",
                                            default: undefined,
                                            type: "number",
                                        });
                                },
                                async argv => {
                                    const { pairingCode, qrCode, nodeId: nodeIdStr, port, ip, ble, instanceId } = argv;
                                    let { setupPinCode, discriminator, shortDiscriminator, qrCodeIndex } = argv;

                                    if (typeof pairingCode === "string" && pairingCode.length > 0) {
                                        const { shortDiscriminator: pairingCodeShortDiscriminator, passcode } =
                                            ManualPairingCodeCodec.decode(pairingCode);
                                        shortDiscriminator = pairingCodeShortDiscriminator;
                                        setupPinCode = passcode;
                                        discriminator = undefined;
                                    } else if (typeof qrCode === "string" && qrCode.length > 0) {
                                        const pairingCodeCodec = QrPairingCodeCodec.decode(qrCode);
                                        if (typeof qrCodeIndex !== "number") {
                                            if (!Number.isFinite(qrCodeIndex)) {
                                                console.log("Invalid QR-Code index provided. Using first.");
                                                qrCodeIndex = 1;
                                            }
                                        }
                                        let qrIndex = Number(qrCodeIndex);
                                        if (pairingCodeCodec.length > 1) {
                                            if (qrIndex < 1 || qrIndex > pairingCodeCodec.length) {
                                                console.log(
                                                    `Multiple (${pairingCodeCodec.length}) pairing codes found in the provided QR-Code. Using first.`,
                                                );
                                                qrIndex = 1;
                                            } else {
                                                console.log(
                                                    `Multiple (${pairingCodeCodec.length}) pairing codes found in the provided QR-Code. Using index ${qrIndex}`,
                                                );
                                            }
                                        } else {
                                            qrIndex = 1;
                                        }
                                        const qrResult = pairingCodeCodec[qrIndex - 1];
                                        discriminator = qrResult.discriminator;
                                        shortDiscriminator = undefined;
                                        setupPinCode = qrResult.passcode;
                                        if (
                                            DiscoveryCapabilitiesSchema.decode(qrResult.discoveryCapabilities).ble &&
                                            !ble
                                        ) {
                                            console.log(
                                                "QR-Code contains BLE discovery capabilities, but BLE is disabled. Please enable if device is not already on network.",
                                            );
                                        }
                                    } else if (discriminator === undefined && shortDiscriminator === undefined) {
                                        discriminator = 3840;
                                    }

                                    const nodeId = nodeIdStr !== undefined ? NodeId(BigInt(nodeIdStr)) : undefined;
                                    await theNode.start();

                                    // Attestation policy: strict rejects errors but allows warnings/info
                                    const strictAttestation = await theNode.Store.get<boolean>(
                                        "StrictAttestationValidation",
                                        false,
                                    );

                                    const commissioningOptions: CommissioningClient.CommissioningOptions = {
                                        passcode: setupPinCode,
                                        discriminator,
                                        nodeId,
                                        // The shell subscribes on demand via the `subscribe` command, not at commission.
                                        autoSubscribe: false,
                                        regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.Outdoor, // Set to the most restrictive if relevant
                                        regulatoryCountryCode: "XX",
                                        onAttestationFailure: findings => {
                                            const accept = strictAttestation
                                                ? findings.every(f => f.level !== "error")
                                                : true;
                                            for (const f of findings) {
                                                logger.info(
                                                    `Attestation finding ${accept ? "accepted" : "rejected"} (${f.level}):`,
                                                    f.type,
                                                    f.message,
                                                );
                                            }
                                            return accept;
                                        },
                                    };

                                    console.log(Diagnostic.json(commissioningOptions));

                                    await theNode.certificateService();

                                    const wifiSsid = await theNode.Store.get<string>("WiFiSsid", "");
                                    const wifiCredentials = await theNode.Store.get<string>("WiFiPassword", "");
                                    if (wifiSsid.length > 0 && wifiCredentials.length > 0) {
                                        commissioningOptions.wifiNetwork = { wifiSsid, wifiCredentials };
                                    }
                                    const threadOperationalDataset = await theNode.Store.get<string>(
                                        "ThreadOperationalDataset",
                                        "",
                                    );
                                    if (threadOperationalDataset.length > 0) {
                                        commissioningOptions.threadNetwork = {
                                            networkName: await theNode.Store.get<string>("ThreadName", ""),
                                            operationalDataset: threadOperationalDataset,
                                        };
                                    }

                                    let node: ClientNode;
                                    if (ip !== undefined && port !== undefined) {
                                        // Known address: locate/create the peer node directly instead of running mDNS
                                        // discovery. Mirrors MatterController's own known-address commissioning path.
                                        node = await theNode.node.peers.forDescriptor({
                                            addresses: [{ ip, port, type: "udp" }],
                                        });
                                        await node.commission(commissioningOptions);
                                    } else {
                                        const identifierData =
                                            instanceId !== undefined
                                                ? { instanceId }
                                                : shortDiscriminator !== undefined
                                                  ? { shortDiscriminator }
                                                  : {};
                                        node = await theNode.node.peers.commission({
                                            ...identifierData,
                                            ...commissioningOptions,
                                            discoveryCapabilities: { ble, onIpNetwork: true },
                                        });
                                    }

                                    console.log("Commissioned Node:", node.peerAddress?.nodeId.toString());

                                    if (!(await awaitSeeded(node))) {
                                        return;
                                    }

                                    // Example to read cluster state directly instead of via a ClusterClient
                                    const descriptor = node.maybeStateOf(DescriptorClient);
                                    if (descriptor !== undefined) {
                                        console.log(descriptor.deviceTypeList);
                                        console.log(descriptor.serverList);
                                    } else {
                                        console.log("No Descriptor Cluster found. This should never happen!");
                                    }

                                    const info = node.maybeStateOf(BasicInformationClient);
                                    if (info !== undefined) {
                                        console.log(info.productName);
                                    } else {
                                        console.log("No BasicInformation Cluster found. This should never happen!");
                                    }
                                },
                            )
                    );
                })
                .command(
                    "open-basic-window <node-id> [timeout]",
                    "Open a basic commissioning window",
                    yargs => {
                        return yargs
                            .positional("node-id", {
                                describe: "node id",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("timeout", {
                                describe: "timeout in seconds",
                                type: "number",
                                default: 900,
                            });
                    },
                    async argv => {
                        const { nodeId, timeout } = argv;
                        await theNode.start();
                        const node = (await theNode.connectAndGetNodes(nodeId, { autoSubscribe: false }))[0];
                        if (!(await awaitSeeded(node))) {
                            return;
                        }

                        await node.openBasicCommissioningWindow(Seconds(timeout));

                        console.log(`Basic Commissioning Window for node ${nodeId} opened`);
                    },
                )
                .command(
                    "open-enhanced-window <node-id> [timeout]",
                    "Open a enhanced commissioning window",
                    yargs => {
                        return yargs
                            .positional("node-id", {
                                describe: "node id",
                                type: "string",
                                demandOption: true,
                            })
                            .positional("timeout", {
                                describe: "timeout in seconds",
                                type: "number",
                                default: 900,
                            });
                    },
                    async argv => {
                        await theNode.start();
                        const { nodeId, timeout } = argv;
                        const node = (await theNode.connectAndGetNodes(nodeId, { autoSubscribe: false }))[0];
                        if (!(await awaitSeeded(node))) {
                            return;
                        }
                        const { qrPairingCode, manualPairingCode } = await node.openEnhancedCommissioningWindow(
                            Seconds(timeout),
                        );

                        console.log(`Enhanced Commissioning Window for node ${nodeId} opened`);

                        console.log(QrCode.get(qrPairingCode));
                        console.log(
                            `QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`,
                        );
                        console.log(`Manual pairing code: ${manualPairingCode}`);
                    },
                )
                .command(
                    "unpair <node-id>",
                    "Unpair/Decommission a node",
                    yargs => {
                        return yargs
                            .positional("node-id", {
                                describe: "node id",
                                type: "string",
                                demandOption: true,
                            })
                            .options({
                                force: {
                                    describe: "Force unpairing even if node is not online",
                                    type: "boolean",
                                    default: false,
                                },
                            });
                    },
                    async argv => {
                        await theNode.start();
                        const { nodeId: nodeIdStr, force } = argv;
                        if (force) {
                            // Force: skip the on-device decommission attempt and just drop the peer locally.
                            const node = findCommissionedNode(theNode, NodeId(BigInt(nodeIdStr)));
                            if (node === undefined) {
                                throw new ImplementationError(`Node ${nodeIdStr} not commissioned`);
                            }
                            await node.delete();
                        } else {
                            const node = (await theNode.connectAndGetNodes(nodeIdStr, { autoSubscribe: false }))[0];
                            if (!(await awaitSeeded(node))) {
                                return;
                            }
                            await node.decommission();
                        }
                    },
                ),
        handler: async (argv: any) => {
            argv.unhandled = true;
        },
    };
}
