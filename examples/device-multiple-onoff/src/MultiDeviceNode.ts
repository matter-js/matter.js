#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This example shows how to create a new device node that is composed of multiple devices.
 * It creates multiple endpoints on the server. For information on how to add a composed device to a bridge please
 * refer to the bridge example!
 * It can be used as CLI script and starting point for your own device node implementation.
 */

import { DeviceTypeId, Endpoint, Environment, Logger, ServerNode, StorageService, Time, VendorId } from "@matter/main";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";
import { OnOffPlugInUnitDevice } from "@matter/main/devices/on-off-plug-in-unit";
import { execSync } from "node:child_process";

const logger = Logger.get("MultiDeviceNode");

const devices = await getConfiguration();
for (let idx = 1; idx < devices.length; idx++) {
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
    } = devices[idx];
    const i = idx + 1;

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

    console.log(
        `Added device ${i} on port ${port} and unique id ${uniqueId}: Passcode: ${passcode}, Discriminator: ${discriminator}`,
    );

    const endpoint = new Endpoint(isSocket ? OnOffPlugInUnitDevice : OnOffLightDevice, { id: "onoff" });
    await server.add(endpoint);

    /**
     * Register state change handlers of the node for identify and onoff states to react to the commands.
     * If the code in these change handlers fail then the change is also rolled back and not executed and an error is
     * reported back to the controller.
     */
    endpoint.events.identify.startIdentifying.on(() => {
        console.log(`Run identify logic for device ${i}, ideally blink a light every 0.5s ...`);
    });

    endpoint.events.identify.stopIdentifying.on(() => {
        console.log(`Stop identify logic for device ${i}...`);
    });

    endpoint.events.onOff.onOff$Changed.on(value => {
        executeCommand(value ? `on${i}` : `off${i}`);
        console.log(`OnOff ${i} is now ${value ? "ON" : "OFF"}`);
    });

    /**
     * Log the endpoint structure for debugging reasons and to allow to verify anything is correct
     */
    logger.info(server);

    console.log("----------------------------");
    console.log(`QR Code for Device ${i} on port ${port}:`);
    console.log("----------------------------");

    /**
     * In order to start the node and announce it into the network we use the run method which resolves when the node goes
     * offline again because we do not need anything more here. See the Full example for other starting options.
     * The QR Code is printed automatically.
     */
    await server.start();
}

/*********************************************************************************************************
 * Convenience Methods
 *********************************************************************************************************/

/**
 * Defines a shell command from an environment variable and execute it and log the response
 */
function executeCommand(scriptParamName: string) {
    const script = Environment.default.vars.string(scriptParamName);
    if (script === undefined) return undefined;
    console.log(`${scriptParamName}: ${execSync(script).toString().slice(0, -1)}`);
}

async function getConfiguration() {
    const environment = Environment.default;

    const storageService = environment.get(StorageService);
    console.log(`Storage location: ${storageService.location} (Directory)`);
    console.log(
        'Use the parameter "--storage-path=NAME-OR-PATH" to specify a different storage location in this directory, use --storage-clear to start with an empty storage.',
    );

    const storageManager = await storageService.open("device");
    const deviceStorage = storageManager.createContext("data");

    let defaultPasscode = 20202021;
    let defaultDiscriminator = 3840;
    let defaultPort = 5550;

    const devices = [];
    const numDevices = environment.vars.number("num") ?? 2;
    for (let i = 1; i <= numDevices; i++) {
        const isSocket = await deviceStorage.get(`isSocket${i}`, environment.vars.string(`type${i}`) === "socket");
        if (await deviceStorage.has(`isSocket${i}`)) {
            console.log(`Device type ${isSocket ? "socket" : "light"} found in storage. --type parameter is ignored.`);
        }
        const deviceName = `Matter ${environment.vars.string(`type${i}`) ?? "light"} device ${i}`;
        const vendorName = "matter-node.js";
        const passcode =
            environment.vars.number(`passcode${i}`) ?? (await deviceStorage.get(`passcode${i}`, defaultPasscode++));
        const discriminator =
            environment.vars.number(`discriminator${i}`) ??
            (await deviceStorage.get(`discriminator${i}`, defaultDiscriminator++));
        // product name / id and vendor id should match what is in the device certificate
        const vendorId = environment.vars.number(`vendorid${i}`) ?? (await deviceStorage.get(`vendorid${i}`, 0xfff1));
        const productName = `node-matter OnOff-Device ${i}`;
        const productId =
            environment.vars.number(`productid${i}`) ?? (await deviceStorage.get(`productid${i}`, 0x8000));

        const port = environment.vars.number(`port${i}`) ?? defaultPort++;

        const uniqueId =
            environment.vars.string(`uniqueid${i}`) ?? (await deviceStorage.get(`uniqueid${i}`, `${i}-${Time.nowMs}`));

        // Persist basic data to keep them also on restart
        await deviceStorage.set(`passcode${i}`, passcode);
        await deviceStorage.set(`discriminator${i}`, discriminator);
        await deviceStorage.set(`vendorid${i}`, vendorId);
        await deviceStorage.set(`productid${i}`, productId);
        await deviceStorage.set(`isSocket${i}`, isSocket);
        await deviceStorage.set(`uniqueid${i}`, uniqueId);

        devices.push({
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
        });
    }

    await storageManager.close();

    return devices;
}
