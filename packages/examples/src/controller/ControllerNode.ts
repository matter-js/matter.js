#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This example shows how to create a Matter controller to pair with a device and interfact with it.
 * It can be used as CLI script, but is more thought as a starting point for your own controller implementation
 * because you need to adjust the code in any way depending on your use case.
 */

import { Diagnostic, Environment, Logger, singleton, StorageService, Time } from "@matter/main";
import { BasicInformationCluster, DescriptorCluster, GeneralCommissioning, OnOff } from "@matter/main/clusters";
import { Ble, ClusterClientObj } from "@matter/main/protocol";
import { ManualPairingCodeCodec, NodeId } from "@matter/main/types";
import { NodeJsBle } from "@matter/nodejs-ble";
import { CommissioningController, NodeCommissioningOptions } from "@project-chip/matter.js";
import { NodeStates } from "@project-chip/matter.js/device";

const logger = Logger.get("Controller");

const environment = Environment.default;

if (environment.vars.get("ble")) {
    // Initialize Ble
    Ble.get = singleton(
        () =>
            new NodeJsBle({
                environment,
                hciId: environment.vars.number("ble.hci.id"),
            }),
    );
}

const storageService = environment.get(StorageService);

console.log(`Storage location: ${storageService.location} (Directory)`);
logger.info(
    'Use the parameter "--storage-path=NAME-OR-PATH" to specify a different storage location in this directory, use --storage-clear to start with an empty storage.',
);

class ControllerNode {
    async start() {
        logger.info(`node-matter Controller started`);

        /**
         * Collect all needed data
         *
         * This block makes sure to collect all needed data from cli or storage. Replace this with where ever your data
         * come from.
         *
         * Note: This example also uses the initialized storage system to store the device parameter data for convenience
         * and easy reuse. When you also do that be careful to not overlap with Matter-Server own contexts
         * (so maybe better not ;-)).
         */

        const controllerStorage = (await storageService.open("controller")).createContext("data");
        const ip = (await controllerStorage.has("ip"))
            ? await controllerStorage.get<string>("ip")
            : environment.vars.string("ip");
        const port = (await controllerStorage.has("port"))
            ? await controllerStorage.get<number>("port")
            : environment.vars.number("port");
        const uniqueId = (await controllerStorage.has("uniqueid"))
            ? await controllerStorage.get<string>("uniqueid")
            : (environment.vars.string("uniqueid") ?? Time.nowMs.toString());
        await controllerStorage.set("uniqueid", uniqueId);
        const adminFabricLabel = (await controllerStorage.has("fabriclabel"))
            ? await controllerStorage.get<string>("fabriclabel")
            : (environment.vars.string("fabriclabel") ?? "matter.js Controller");
        await controllerStorage.set("fabriclabel", adminFabricLabel);

        const pairingCode = environment.vars.string("pairingcode");
        let longDiscriminator, setupPin, shortDiscriminator;
        if (pairingCode !== undefined) {
            const pairingCodeCodec = ManualPairingCodeCodec.decode(pairingCode);
            shortDiscriminator = pairingCodeCodec.shortDiscriminator;
            longDiscriminator = undefined;
            setupPin = pairingCodeCodec.passcode;
            logger.debug(`Data extracted from pairing code: ${Diagnostic.json(pairingCodeCodec)}`);
        } else {
            longDiscriminator =
                environment.vars.number("longDiscriminator") ??
                (await controllerStorage.get("longDiscriminator", 3840));
            if (longDiscriminator > 4095) throw new Error("Discriminator value must be less than 4096");
            setupPin = environment.vars.number("passcode") ?? (await controllerStorage.get("passcode", 20202021));
        }
        if ((shortDiscriminator === undefined && longDiscriminator === undefined) || setupPin === undefined) {
            throw new Error(
                "Please specify the longDiscriminator of the device to commission with -longDiscriminator or provide a valid passcode with --passcode=xxxxxx",
            );
        }

        // Collect commissioning options from commandline parameters
        const commissioningOptions: NodeCommissioningOptions["commissioning"] = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
            regulatoryCountryCode: "XX",
        };

        let ble = false;
        if (environment.vars.get("ble")) {
            ble = true;
            const wifiSsid = environment.vars.string("ble.wifi.ssid");
            const wifiCredentials = environment.vars.string("ble.wifi.credentials");
            const threadNetworkName = environment.vars.string("ble.thread.networkname");
            const threadOperationalDataset = environment.vars.string("ble.thread.operationaldataset");
            if (wifiSsid !== undefined && wifiCredentials !== undefined) {
                logger.info(`Registering Commissioning over BLE with WiFi: ${wifiSsid}`);
                commissioningOptions.wifiNetwork = {
                    wifiSsid: wifiSsid,
                    wifiCredentials: wifiCredentials,
                };
            }
            if (threadNetworkName !== undefined && threadOperationalDataset !== undefined) {
                logger.info(`Registering Commissioning over BLE with Thread: ${threadNetworkName}`);
                commissioningOptions.threadNetwork = {
                    networkName: threadNetworkName,
                    operationalDataset: threadOperationalDataset,
                };
            }
        }

        /** Create Matter Controller Node and bind it to the Environment. */
        const commissioningController = new CommissioningController({
            environment: {
                environment,
                id: uniqueId,
            },
            autoConnect: false, // Do not auto connect to the commissioned nodes
            adminFabricLabel,
        });

        /** Start the Matter Controller Node */
        await commissioningController.start();

        // When we do not have a commissioned node we need to commission the device provided by CLI parameters
        if (!commissioningController.isCommissioned()) {
            const options: NodeCommissioningOptions = {
                commissioning: commissioningOptions,
                discovery: {
                    knownAddress: ip !== undefined && port !== undefined ? { ip, port, type: "udp" } : undefined,
                    identifierData:
                        longDiscriminator !== undefined
                            ? { longDiscriminator }
                            : shortDiscriminator !== undefined
                              ? { shortDiscriminator }
                              : {},
                    discoveryCapabilities: {
                        ble,
                    },
                },
                passcode: setupPin,
            };
            logger.info(`Commissioning ... ${Diagnostic.json(options)}`);
            const nodeId = await commissioningController.commissionNode(options);

            console.log(`Commissioning successfully done with nodeId ${nodeId}`);
        }

        // After commissioning or if we have a commissioned node we can connect to it
        try {
            const nodes = commissioningController.getCommissionedNodes();
            console.log("Found commissioned nodes:", Diagnostic.json(nodes));

            const nodeId = NodeId(environment.vars.number("nodeid") ?? nodes[0]);
            if (!nodes.includes(nodeId)) {
                throw new Error(`Node ${nodeId} not found in commissioned nodes`);
            }

            const nodeDetails = commissioningController.getCommissionedNodesDetails();
            console.log(
                "Commissioned nodes details:",
                Diagnostic.json(nodeDetails.find(node => node.nodeId === nodeId)),
            );

            // Get the node instance
            const node = await commissioningController.getNode(nodeId);

            // Subscribe to events of the node
            node.events.attributeChanged.on(({ path: { nodeId, clusterId, endpointId, attributeName }, value }) =>
                console.log(
                    `attributeChangedCallback ${nodeId}: Attribute ${endpointId}/${clusterId}/${attributeName} changed to ${Diagnostic.json(
                        value,
                    )}`,
                ),
            );
            node.events.eventTriggered.on(({ path: { nodeId, clusterId, endpointId, eventName }, events }) =>
                console.log(
                    `eventTriggeredCallback ${nodeId}: Event ${endpointId}/${clusterId}/${eventName} triggered with ${Diagnostic.json(
                        events,
                    )}`,
                ),
            );
            node.events.stateChanged.on(info => {
                switch (info) {
                    case NodeStates.Connected:
                        console.log(`state changed: Node ${nodeId} connected`);
                        break;
                    case NodeStates.Disconnected:
                        console.log(`state changed: Node ${nodeId} disconnected`);
                        break;
                    case NodeStates.Reconnecting:
                        console.log(`state changed: Node ${nodeId} reconnecting`);
                        break;
                    case NodeStates.WaitingForDeviceDiscovery:
                        console.log(`state changed: Node ${nodeId} waiting for device discovery`);
                        break;
                }
            });
            node.events.structureChanged.on(() => {
                console.log(`Node ${nodeId} structure changed`);
            });

            // Connect to the node if not already connected, this will automatically subscribe to all attributes and events
            if (!node.isConnected) {
                node.connect();
            }

            // Wait for initialization oif not yet initialized - this should only happen if we just commissioned it
            if (!node.initialized) {
                await node.events.initialized;
            }

            // Or use this to wait for full remote initialization and reconnection.
            // Will only return when node is connected!
            // await node.events.initializedFromRemote;

            node.logStructure();

            // Example to initialize a ClusterClient and access concrete fields as API methods
            const descriptor = node.getRootClusterClient(DescriptorCluster);
            if (descriptor !== undefined) {
                console.log(await descriptor.attributes.deviceTypeList.get()); // you can call that way
                console.log(await descriptor.getServerListAttribute()); // or more convenient that way
            } else {
                console.log("No Descriptor Cluster found. This should never happen!");
            }

            // Example to subscribe to a field and get the value
            const info = node.getRootClusterClient(BasicInformationCluster);
            if (info !== undefined) {
                console.log(await info.getProductNameAttribute()); // This call is executed remotely
                //console.log(await info.subscribeProductNameAttribute(value => console.log("productName", value), 5, 30));
                //console.log(await info.getProductNameAttribute()); // This call is resolved locally because we have subscribed to the value!
            } else {
                console.log("No BasicInformation Cluster found. This should never happen!");
            }

            // Example to get all Attributes of the commissioned node: */*/*
            //const attributesAll = await interactionClient.getAllAttributes();
            //console.log("Attributes-All:", Diagnostic.json(attributesAll));

            // Example to get all Attributes of all Descriptor Clusters of the commissioned node: */DescriptorCluster/*
            //const attributesAllDescriptor = await interactionClient.getMultipleAttributes([{ clusterId: DescriptorCluster.id} ]);
            //console.log("Attributes-Descriptor:", JSON.stringify(attributesAllDescriptor, null, 2));

            // Example to get all Attributes of the Basic Information Cluster of endpoint 0 of the commissioned node: 0/BasicInformationCluster/*
            //const attributesBasicInformation = await interactionClient.getMultipleAttributes([{ endpointId: 0, clusterId: BasicInformationCluster.id} ]);
            //console.log("Attributes-BasicInformation:", JSON.stringify(attributesBasicInformation, null, 2));

            const devices = node.getDevices();
            if (devices[0] && devices[0].number === 1) {
                // Example to subscribe to all Attributes of endpoint 1 of the commissioned node: */*/*
                //await interactionClient.subscribeMultipleAttributes([{ endpointId: 1, /* subscribe anything from endpoint 1 */ }], 0, 180, data => {
                //    console.log("Subscribe-All Data:", Diagnostic.json(data));
                //});

                // Example using legacy ClusterClient approach
                const onOff: ClusterClientObj<OnOff.Complete> | undefined = devices[0].getClusterClient(OnOff.Complete);
                if (onOff !== undefined) {
                    let onOffStatus = await onOff.getOnOffAttribute();
                    console.log("initial onOffStatus (legacy approach)", onOffStatus);

                    onOff.addOnOffAttributeListener(value => {
                        console.log("subscription onOffStatus (legacy approach)", value);
                        onOffStatus = value;
                    });
                    // read data every minute to keep up the connection to show the subscription is working
                    setInterval(() => {
                        onOff
                            .toggle()
                            .then(() => {
                                onOffStatus = !onOffStatus;
                                console.log("onOffStatus (legacy approach)", onOffStatus);
                            })
                            .catch(error => logger.error(error));
                    }, 60000);
                }

                // Example using new ClientNode style state and command access
                // This demonstrates the new endpoint.state and endpoint.commandsOf() methods
                console.log("\n--- Demonstrating new ClientNode style access ---");
                
                // Access state using the new proxy approach
                try {
                    // Access OnOff state via endpoint.state proxy
                    const onOffState = devices[0].state.onOff?.onOff;
                    console.log("OnOff state via proxy:", onOffState);
                    
                    // Access state using typed stateOf method
                    const typedOnOffState = devices[0].stateOf(OnOff.Complete);
                    console.log("OnOff state via stateOf():", typedOnOffState.onOff);
                    
                    // Access commands using typed commandsOf method
                    const onOffCommands = devices[0].commandsOf(OnOff.Complete);
                    console.log("Available OnOff commands:", Object.keys(onOffCommands));
                    
                    // Toggle using the new command access approach
                    if (onOffCommands.toggle) {
                        console.log("Toggling OnOff using new commandsOf approach...");
                        await onOffCommands.toggle();
                        
                        // Check state after toggle
                        const newState = devices[0].state.onOff?.onOff;
                        console.log("OnOff state after toggle:", newState);
                    }
                } catch (error) {
                    console.log("Note: OnOff cluster may not be available on this device:", error.message);
                }
            }
        } finally {
            //await matterServer.close(); // Comment out when subscribes are used, else the connection will be closed
            setTimeout(() => process.exit(0), 1000000);
        }
    }
}

new ControllerNode().start().catch(error => logger.error(error));
