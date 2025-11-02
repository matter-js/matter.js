/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "BatteryStorage", classification: "simple", xref: "device§14.4",
    details: "A Battery Storage device is a device that allows a DC battery, which can optionally be comprised of " +
        "a set parallel strings of battery packs and associated controller, and an AC inverter, to be " +
        "monitored and controlled by an Energy Management System in order to manage the peaks and troughs of " +
        "supply and demand, and/or to optimize cost of the energy consumed in premises. It is not intended to " +
        "be used for a UPS directly supplying a set of appliances, nor for portable battery storage devices.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.4.7" },
        { tag: "requirement", name: "PowerSource", xref: "device§14.4.5" },
        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.4.5" },
        { tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.4.5" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§14.4.5" },
        { tag: "requirement", name: "SolarPower", xref: "device§14.4.5" }
    ]
});
