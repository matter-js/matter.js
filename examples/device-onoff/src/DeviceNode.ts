#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This example shows how to create a simple on-off Matter device as a light or as a socket.
 * It can be used as CLI script and starting point for your own device node implementation.
 * This example is CJS conform and do not use top level await's.
 */

import { DeviceTypeId, Endpoint, Environment, Logger, ServerNode, StorageService, Time, VendorId } from "@matter/main";
import { OnOffLightDevice, OnOffPlugInUnitDevice } from "@matter/main/devices";
import { execSync } from "node:child_process";

const logger = Logger.get("DeviceNode");

async function main() {
    /** Initialize configuration values */
    const {
        isSocket,
        deviceName,
        vendorName,
        passcode,
        discriminator,
        vendorId,
        productName,
        productId,
        port,
        uniqueId,
    } = await getConfiguration();

    /**
     * Create a Matter ServerNode, which contains the Root Endpoint and all relevant data and configuration
     */
    const server = await ServerNode.create({
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
            deviceType: DeviceTypeId(isSocket ? OnOffPlugInUnitDevice.deviceType : OnOffLightDevice.deviceType),
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
    });

    /**
     * Matter Nodes are a composition of endpoints. Create and add a single endpoint to the node. This example uses the
     * OnOffLightDevice or OnOffPlugInUnitDevice depending on the value of the type parameter. It also assigns this Part a
     * unique ID to store the endpoint number for it in the storage to restore the device on restart.
     * In this case we directly use the default command implementation from matter.js. Check out the DeviceNodeFull example
     * to see how to customize the command handlers.
     */
    const endpoint = new Endpoint(isSocket ? OnOffPlugInUnitDevice : OnOffLightDevice, { id: "onoff" });
    await server.add(endpoint);

    /**
     * Register state change handlers and events of the node for identify and onoff states to react to the commands.
     * If the code in these change handlers fail then the change is also rolled back and not executed and an error is
     * reported back to the controller.
     */
    endpoint.events.identify.startIdentifying.on(() => {
        console.log(`Run identify logic, ideally blink a light every 0.5s ...`);
    });

    endpoint.events.identify.stopIdentifying.on(() => {
        console.log(`Stop identify logic ...`);
    });

    endpoint.events.onOff.onOff$Changed.on(value => {
        executeCommand(value ? "on" : "off");
        console.log(`OnOff is now ${value ? "ON" : "OFF"}`);
    });

    /**
     * Log the endpoint structure for debugging reasons and to allow to verify anything is correct
     */
    logger.info(server);

    /**
     * In order to start the node and announce it into the network we use the run method which resolves when the node goes
     * offline again because we do not need anything more here. See the Full example for other starting options.
     * The QR Code is printed automatically.
     */
    await server.run();
}

main().catch(error => console.error(error));

/*********************************************************************************************************
 * Convenience Methods
 *********************************************************************************************************/

/** Defined a shell command from an environment variable and execute it and log the response. */
function executeCommand(scriptParamName: string) {
    const script = Environment.default.vars.string(scriptParamName);
    if (script === undefined) return undefined;
    console.log(`${scriptParamName}: ${execSync(script).toString().slice(0, -1)}`);
}

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

    const storageManager = await storageService.open("device");
    const deviceStorage = storageManager.createContext("data");

    const isSocket = await deviceStorage.get("isSocket", environment.vars.get("type") === "socket");
    if (await deviceStorage.has("isSocket")) {
        console.log(`Device type ${isSocket ? "socket" : "light"} found in storage. --type parameter is ignored.`);
    }
    const deviceName = "Matter test device";
    const vendorName = "matter-node.js";
    const passcode = environment.vars.number("passcode") ?? (await deviceStorage.get("passcode", 20202021));
    const discriminator = environment.vars.number("discriminator") ?? (await deviceStorage.get("discriminator", 3840));
    // product name / id and vendor id should match what is in the device certificate
    const vendorId = environment.vars.number("vendorid") ?? (await deviceStorage.get("vendorid", 0xfff1));
    const productName = `node-matter OnOff ${isSocket ? "Socket" : "Light"}`;
    const productId = environment.vars.number("productid") ?? (await deviceStorage.get("productid", 0x8000));

    const port = environment.vars.number("port") ?? 5540;

    const uniqueId =
        environment.vars.string("uniqueid") ?? (await deviceStorage.get("uniqueid", Time.nowMs)).toString();

    // Persist basic data to keep them also on restart
    await deviceStorage.set({
        passcode,
        discriminator,
        vendorid: vendorId,
        productid: productId,
        isSocket,
        uniqueid: uniqueId,
    });

    await storageManager.close();

    return {
        isSocket,
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
