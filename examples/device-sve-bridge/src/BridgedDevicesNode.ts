#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This example shows how to create a new device node that is composed of multiple devices.
 * It creates multiple endpoints on the server. For information on how to add a composed device to a bridge please
 * refer to the bridge example!
 * It can be used as CLI script and starting point for your own device node implementation.
 */

import { Bytes } from "@matter/general";
import {
    Endpoint,
    Environment,
    LogDestination,
    LogFormat,
    LogLevel,
    Logger,
    ServerNode,
    StorageService,
    Time,
    VendorId,
} from "@matter/main";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { GroupcastServer } from "@matter/main/behaviors/groupcast";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { createFileLogger } from "@matter/nodejs";

/** Set up file-based logger using process start time as filename */
const logFileName = `${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
Logger.destinations.file = LogDestination({
    write: await createFileLogger(logFileName),
    level: LogLevel.DEBUG,
    format: LogFormat("plain"),
});

//const logger = Logger.get("Device");

/** Initialize configuration values */
const { deviceName, vendorName, passcode, discriminator, vendorId, productName, productId, port, uniqueId } =
    await getConfiguration();

const networkId = Bytes.fromHex("6574682D617070");

/**
 * Create a Matter ServerNode, which contains the Root Endpoint and all relevant data and configuration
 */
const server = await ServerNode.create(
    ServerNode.RootEndpoint.with(
        GroupcastServer.with("Listener", "Sender", "PerGroup"),
        NetworkCommissioningServer.with("EthernetNetworkInterface"), // Set the correct Ethernet network Commissioning cluster
    ),
    {
        // Required: Give the Node a unique ID which is used to store the state of this node
        id: uniqueId,

        // Provide Network relevant configuration like the port
        // Optional when operating only one device on a host, Default port is 5540
        network: {
            port,
        },

        // Provide Commissioning relevant settings
        // Optional for development/testing purposes
        commissioning: {
            passcode,
            discriminator,
        },

        // Provide Node announcement settings
        // Optional: If Ommitted some development defaults are used
        productDescription: {
            name: deviceName,
            deviceType: AggregatorEndpoint.deviceType,
        },

        // Provide defaults for the BasicInformation cluster on the Root endpoint
        // Optional: If Omitted some development defaults are used
        basicInformation: {
            vendorName,
            vendorId: VendorId(vendorId),
            nodeLabel: productName,
            productName,
            productLabel: productName,
            productId,
            serialNumber: `matterjs-${uniqueId}`,
            uniqueId,
        },
        networkCommissioning: {
            maxNetworks: 1,
            interfaceEnabled: true,
            networks: [{ networkId: networkId, connected: true }],

            // We fail TC_CNET_4_3 with these
            //lastConnectErrorValue: 0,
            //lastNetworkId: networkId,
            //lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
        },
    },
);

const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
await server.add(aggregator);

const onOffName = `OnOff Light`;
await aggregator.add(
    new Endpoint(OnOffLightDevice.with(BridgedDeviceBasicInformationServer), {
        id: `onoff`,
        bridgedDeviceBasicInformation: {
            nodeLabel: onOffName,
            productName: onOffName,
            productLabel: onOffName,
            serialNumber: `node-matter-${uniqueId}-1`,
            reachable: true,
        },
    }),
);

const dimmableName = `OnOff Dimmer`;
await aggregator.add(
    new Endpoint(DimmableLightDevice.with(BridgedDeviceBasicInformationServer), {
        id: `dimmable`,
        bridgedDeviceBasicInformation: {
            nodeLabel: dimmableName,
            productName: dimmableName,
            productLabel: dimmableName,
            serialNumber: `node-matter-${uniqueId}-2`,
            reachable: true,
        },
    }),
);

//logger.info(server);

await server.start();

async function getConfiguration() {
    /**
     * Collect all needed data
     *
     * This block collects all needed data from cli, environment or storage. Replace this with where ever your data come from.
     *
     * Note: This example uses the matter.js process storage system to store the device parameter data for convenience
     * and easy reuse. When you also do that be careful to not overlap with Matter-Server own storage contexts
     * (so maybe better not do it ;-)).
     */
    const environment = Environment.default;

    const storageService = environment.get(StorageService);
    console.log(`Storage location: ${storageService.location} (Directory)`);
    console.log(
        'Use the parameter "--storage-path=NAME-OR-PATH" to specify a different storage location in this directory, use --storage-clear to start with an empty storage.',
    );
    const deviceStorage = (await storageService.open("device")).createContext("data");

    const deviceName = "Matter test device";
    const vendorName = "matter.js";
    const passcode = environment.vars.number("passcode") ?? (await deviceStorage.get("passcode", 20202021));
    const discriminator = environment.vars.number("discriminator") ?? (await deviceStorage.get("discriminator", 3840));
    // product name / id and vendor id should match what is in the device certificate
    const vendorId = environment.vars.number("vendorid") ?? (await deviceStorage.get("vendorid", 0xfff1));
    const productName = `matter-js Bridge`;
    const productId = environment.vars.number("productid") ?? (await deviceStorage.get("productid", 0x8000));

    const port = environment.vars.number("port") ?? 5540;

    const uniqueId =
        environment.vars.string("uniqueid") ?? (await deviceStorage.get("uniqueid", Time.nowMs.toString()));

    // Persist basic data to keep them also on restart
    await deviceStorage.set({
        passcode,
        discriminator,
        vendorid: vendorId,
        productid: productId,
        uniqueid: uniqueId,
    });

    return {
        deviceName,
        vendorName,
        passcode,
        discriminator,
        vendorId,
        productName,
        productId,
        port,
        uniqueId,
    };
}
