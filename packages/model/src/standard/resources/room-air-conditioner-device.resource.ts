/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RoomAirConditioner", classification: "simple", xref: "device§13.3",
    details: "This defines conformance to the Room Air Conditioner device type." +
        "\n" +
        "A Room Air Conditioner is a device with the primary function of controlling the air temperature in a " +
        "single room.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.3.6" },
        { tag: "requirement", name: "Groups", xref: "device§13.3.6" },
        { tag: "requirement", name: "OnOff", xref: "device§13.3.6" },
        { tag: "requirement", name: "ScenesManagement", xref: "device§13.3.6" },
        { tag: "requirement", name: "Thermostat", xref: "device§13.3.6" },
        { tag: "requirement", name: "FanControl", xref: "device§13.3.6" },
        { tag: "requirement", name: "ThermostatUserInterfaceConfiguration", xref: "device§13.3.6" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§13.3.6" },
        { tag: "requirement", name: "RelativeHumidityMeasurement", xref: "device§13.3.6" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§13.3.5" },
        { tag: "requirement", name: "HumiditySensor", xref: "device§13.3.5" }
    ]
});
