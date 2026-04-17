#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SVE test bridge: aggregator with OnOff light, Dimmable light, Contact sensor and Occupancy sensor.
 * Contact sensor and Occupancy sensor have change-event features enabled and use a configurable
 * 5-minute timer to toggle their state.
 */

import { Bytes, Minutes, Timer } from "@matter/general";
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
import { BooleanStateServer } from "@matter/main/behaviors/boolean-state";
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information";
import { GroupcastServer } from "@matter/main/behaviors/groupcast";
import { NetworkCommissioningServer } from "@matter/main/behaviors/network-commissioning";
import { OccupancySensingServer } from "@matter/main/behaviors/occupancy-sensing";
import { ContactSensorDevice } from "@matter/main/devices/contact-sensor";
import { DimmableLightDevice } from "@matter/main/devices/dimmable-light";
import { OnOffLightDevice } from "@matter/main/devices/on-off-light";
import { OccupancySensorDevice } from "@matter/main/devices/occupancy-sensor";
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator";
import { createFileLogger } from "@matter/nodejs";

const logger = Logger.get("SveBridge");

/** Set up file-based logger using process start time as filename */
const logFileName = `${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
Logger.destinations.file = LogDestination({
    write: await createFileLogger(logFileName),
    level: LogLevel.DEBUG,
    format: LogFormat("plain"),
});

/** Initialize configuration values */
const {
    deviceName,
    vendorName,
    passcode,
    discriminator,
    vendorId,
    productName,
    productId,
    port,
    uniqueId,
    contactTimerEnabled,
    occupancyTimerEnabled,
} = await getConfiguration();

const networkId = Bytes.fromHex("6574682D617070");

/**
 * Create a Matter ServerNode, which contains the Root Endpoint and all relevant data and configuration
 */
const server = await ServerNode.create(
    ServerNode.RootEndpoint.with(
        GroupcastServer.with("Listener", "Sender", "PerGroup"),
        NetworkCommissioningServer.with("EthernetNetworkInterface"),
    ),
    {
        id: uniqueId,

        network: {
            port,
        },

        commissioning: {
            passcode,
            discriminator,
        },

        productDescription: {
            name: deviceName,
            deviceType: AggregatorEndpoint.deviceType,
        },

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
        },
    },
);

const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator", number: 1 });
await server.add(aggregator);

// --- Endpoint 2: OnOff Light ---

const onOffName = `OnOff Light`;
await aggregator.add(
    new Endpoint(OnOffLightDevice.with(BridgedDeviceBasicInformationServer), {
        id: `onoff`,
        number: 2,
        bridgedDeviceBasicInformation: {
            nodeLabel: onOffName,
            productName: onOffName,
            productLabel: onOffName,
            serialNumber: `node-matter-${uniqueId}-1`,
            reachable: true,
        },
    }),
);

// --- Endpoint 3: Dimmable Light ---

const dimmableName = `Dimmable Light`;
await aggregator.add(
    new Endpoint(DimmableLightDevice.with(BridgedDeviceBasicInformationServer), {
        id: `dimmable`,
        number: 3,
        bridgedDeviceBasicInformation: {
            nodeLabel: dimmableName,
            productName: dimmableName,
            productLabel: dimmableName,
            serialNumber: `node-matter-${uniqueId}-2`,
            reachable: true,
        },
    }),
);

// --- Endpoint 4: Contact Sensor (BooleanState with ChangeEvent feature) ---

const contactName = `Contact Sensor`;
const contactEndpoint = new Endpoint(
    ContactSensorDevice.with(BridgedDeviceBasicInformationServer, BooleanStateServer.with("ChangeEvent")),
    {
        id: `contact`,
        number: 4,
        bridgedDeviceBasicInformation: {
            nodeLabel: contactName,
            productName: contactName,
            productLabel: contactName,
            serialNumber: `node-matter-${uniqueId}-3`,
            reachable: true,
        },
        booleanState: {
            stateValue: false, // initial: open / no contact
        },
    },
);
await aggregator.add(contactEndpoint);

// --- Endpoint 5: Occupancy Sensor (PhysicalContact + OccupancyEvent features) ---

const occupancyName = `Occupancy Sensor`;
const occupancyEndpoint = new Endpoint(
    OccupancySensorDevice.with(
        BridgedDeviceBasicInformationServer,
        OccupancySensingServer.with("PhysicalContact", "OccupancyEvent"),
    ),
    {
        id: `occupancy`,
        number: 5,
        bridgedDeviceBasicInformation: {
            nodeLabel: occupancyName,
            productName: occupancyName,
            productLabel: occupancyName,
            serialNumber: `node-matter-${uniqueId}-4`,
            reachable: true,
        },
        occupancySensing: {
            occupancy: { occupied: false }, // initial: unoccupied
        },
    },
);
await aggregator.add(occupancyEndpoint);

// --- State toggle timers (5 minutes) ---

const TOGGLE_INTERVAL = Minutes(5);
const timers = new Array<Timer>();

if (contactTimerEnabled) {
    const contactTimer = Time.getPeriodicTimer("contact-toggle", TOGGLE_INTERVAL, async () => {
        const current = contactEndpoint.stateOf(BooleanStateServer).stateValue;
        logger.info(`Contact sensor toggle: ${current} → ${!current}`);
        await contactEndpoint.set({ booleanState: { stateValue: !current } });
    });
    contactTimer.start();
    timers.push(contactTimer);
    logger.info("Contact sensor 5-minute toggle timer enabled");
}

if (occupancyTimerEnabled) {
    const occupancyTimer = Time.getPeriodicTimer("occupancy-toggle", TOGGLE_INTERVAL, async () => {
        const current = occupancyEndpoint.stateOf(OccupancySensingServer).occupancy.occupied;
        logger.info(`Occupancy sensor toggle: occupied=${current} → occupied=${!current}`);
        await occupancyEndpoint.set({ occupancySensing: { occupancy: { occupied: !current } } });
    });
    occupancyTimer.start();
    timers.push(occupancyTimer);
    logger.info("Occupancy sensor 5-minute toggle timer enabled");
}

await server.start();

async function getConfiguration() {
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
    const vendorId = environment.vars.number("vendorid") ?? (await deviceStorage.get("vendorid", 0xfff1));
    const productName = `matter-js Bridge`;
    const productId = environment.vars.number("productid") ?? (await deviceStorage.get("productid", 0x8000));

    const port = environment.vars.number("port") ?? 5540;

    const uniqueId =
        environment.vars.string("uniqueid") ?? (await deviceStorage.get("uniqueid", Time.nowMs.toString()));

    // Toggle-timer CLI flags (default: enabled)
    const contactTimerEnabled = (environment.vars.number("contact-timer") ?? 0) !== 0;
    const occupancyTimerEnabled = (environment.vars.number("occupancy-timer") ?? 0) !== 0;

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
        contactTimerEnabled,
        occupancyTimerEnabled,
    };
}
