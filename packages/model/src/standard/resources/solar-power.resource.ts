/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SolarPower", classification: "simple", xref: "device§14.3",
    details: "A Solar Power device is a device that allows a solar panel array, which can optionally be comprised " +
        "of a set parallel strings of solar panels, and its associated controller and, if appropriate, " +
        "inverter, to be monitored and controlled by an Energy Management System.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.3.6" },
        { tag: "requirement", name: "PowerSource", xref: "device§14.3.5" },
        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.3.5" },
        { tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.3.5" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§14.3.5" }
    ]
});
