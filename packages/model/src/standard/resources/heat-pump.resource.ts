/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "HeatPump", xref: "device§14.5",

    details: "A Heat Pump device is a device that uses electrical energy to heat either spaces or water tanks " +
        "using ground, water or air as the heat source. These typically can heat the air or can pump water " +
        "via central heating radiators or underfloor heating systems. It is typical to also heat hot water " +
        "and store the heat in a hot water tank." +
        "\n" +
        "Note that the Water Heater device type can also be heated by a heat pump and has similar " +
        "requirements, but that cannot be used for space heating.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.5.7" },
        { tag: "requirement", name: "Thermostat", discriminator: "O:clientCluster", xref: "device§14.5.7" },
        { tag: "requirement", name: "PowerSource", xref: "device§14.5.5" },
        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.5.5" },
        { tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.5.5" },
        { tag: "requirement", name: "Thermostat", discriminator: "O:deviceType", xref: "device§14.5.5" },
        { tag: "requirement", name: "WaterHeater", xref: "device§14.5.5" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§14.5.5" }
    ]
});
