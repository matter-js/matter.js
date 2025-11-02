/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "EnergyEvse", classification: "simple", xref: "device§14.1",
    details: "An EVSE (Electric Vehicle Supply Equipment) is a device that allows an EV (Electric Vehicle) to be " +
        "connected to the mains electricity supply to allow it to be charged (or discharged in case of " +
        "Vehicle to Grid / Vehicle to Home applications).",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.1.6" },
        { tag: "requirement", name: "EnergyEvse", xref: "device§14.1.6" },
        { tag: "requirement", name: "EnergyEvseMode", xref: "device§14.1.6" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§14.1.6" },
        { tag: "requirement", name: "PowerSource", xref: "device§14.1.5" },
        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.1.5" },
        { tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.1.5" }
    ]
});
