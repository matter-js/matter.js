#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This demonstrates bringing a "socket" device with electrical power and energy measurement online with matter.js.

import { Endpoint, Seconds, ServerNode, Time } from "@matter/main";
import { ElectricalEnergyMeasurementServer, ElectricalPowerMeasurementServer } from "@matter/main/behaviors";
import { ElectricalEnergyMeasurement, ElectricalPowerMeasurement } from "@matter/main/clusters";
import { OnOffPlugInUnitDevice } from "@matter/main/devices";
import { MeasurementType } from "@matter/main/types";

// Devices are compositions of behaviors like OnOffServer above.  To extend an existing device you use builder methods.
//
// In this case we are using with() to install our On/Off cluster behavior.
const MeasuredSocket = OnOffPlugInUnitDevice.with(
    ElectricalPowerMeasurementServer.with(ElectricalPowerMeasurement.Feature.AlternatingCurrent),
    ElectricalEnergyMeasurementServer.with(
        ElectricalEnergyMeasurement.Feature.ImportedEnergy,
        ElectricalEnergyMeasurement.Feature.CumulativeEnergy,
    ),
);

// Accuracy details for the measured values. Here we fake some values to demonstrate the structure.
// If you know the details of your device you should provide the correct values.
// These values tell that the device can measure from Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER with an accuracy of 1 unit.
// Unit is depending on the value e.g. mA, mV, mW, mWh and such.
const fakedAccuracyDetails = {
    measured: true,
    minMeasuredValue: Number.MIN_SAFE_INTEGER,
    maxMeasuredValue: Number.MAX_SAFE_INTEGER,
    accuracyRanges: [
        {
            rangeMin: Number.MIN_SAFE_INTEGER,
            rangeMax: Number.MAX_SAFE_INTEGER,
            fixedMax: 1,
        },
    ],
};

// Define the endpoint for the device.  This is the "thing/device" that will appear on the network.
const measuredSocketEndpoint = new Endpoint(MeasuredSocket, {
    id: "socket",
    electricalPowerMeasurement: {
        activePower: 0,
        activeCurrent: 0,
        voltage: 0,
        frequency: 0,
        powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
        // We simulate that we can measure the following values.
        accuracy: [
            {
                measurementType: MeasurementType.ActivePower, // mW
                ...fakedAccuracyDetails,
            },
            {
                measurementType: MeasurementType.ActiveCurrent, // mA
                ...fakedAccuracyDetails,
            },
            {
                measurementType: MeasurementType.Voltage, // mV
                ...fakedAccuracyDetails,
            },
            {
                measurementType: MeasurementType.Frequency, // mHz
                ...fakedAccuracyDetails,
            },
        ],
        numberOfMeasurementTypes: 4,
    },
    electricalEnergyMeasurement: {
        accuracy: {
            measurementType: MeasurementType.ElectricalEnergy, // mWh
            ...fakedAccuracyDetails,
        },
    },
});

// Physical devices appear as "nodes" on a Matter network.  As a device implementer you use a NodeServer to bring a
// device online.
//
// Note there are a large number of options to NodeServer that we are allowing to take default values here.  See
// IlluminatedRollerShade.ts for a more detailed example.
const node = await ServerNode.create();

// Nodes are a composition of endpoints.  Add a single endpoint to the node, our example socket device.
await node.add(measuredSocketEndpoint);

// We can now interact with the device.  For example, we can listen for changes to the on/off state.
measuredSocketEndpoint.events.onOff.onOff$Changed.on(value => {
    console.log(`Light is now ${value ? "ON" : "OFF"}`);
});

// We will simulate the device sending measurements every 10 seconds.
// When the device is turned off, the measurements will be zero, otherwise they will be random values.
// Note: This is just example code. In a real device, you would set the data to 0 once the device is turned off.
const fakeMeasurementTimer = Time.getPeriodicTimer("fakeMeasurement", Seconds(10), async () => {
    const turnedOn = measuredSocketEndpoint.state.onOff.onOff;
    const power = turnedOn ? Math.round(Math.random() * 1000) : 0; // W
    const current = turnedOn ? Math.round(Math.random() * 32) : 0; // A
    const voltage = turnedOn ? 227 + Math.round(Math.random() * 5) : 0; // V
    const frequency = turnedOn ? 50 + Math.round(Math.random() * 5) : 0; // Hz
    const energy = turnedOn ? Math.round(Math.random() * 1000) : 0; // Wh

    await measuredSocketEndpoint.set({
        electricalPowerMeasurement: {
            activePower: power * 1000,
            activeCurrent: current * 1000,
            voltage: voltage * 1000,
            frequency: frequency * 1000,
        },
        // For Energy Measurement the set could be done this way but this would only update the values as provided.
        // The required events needs to be triggered manually.
        /*
        electricalEnergyMeasurement: {
            cumulativeEnergyImported: {
                energy: energy * 1000,
            },
        },
        */
    });

    // Or do this way then also events are sent
    await measuredSocketEndpoint.act(agent =>
        agent.get(ElectricalEnergyMeasurementServer).setMeasurement({
            cumulativeEnergy: {
                imported: {
                    energy: energy * 1000,
                },
            },
        }),
    );
});

fakeMeasurementTimer.start();

// Our device is now built, so we can bring the node online.
//
// Note that you may serve multiple nodes from a single process.  We only have one, however, so we can use the run()
// method of the node.
await node.run();

// We went offline, so we can stop the timer.
fakeMeasurementTimer.stop();
