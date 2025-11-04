/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "AirPurifier", xref: "device§9.3",
    details: "An Air Purifier is a standalone device that is designed to clean the air in a room." +
        "\n" +
        "It is a device that has a fan to control the air speed while it is operating. Optionally, it can " +
        "report on the condition of its filters.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§9.3.5" },
        { tag: "requirement", name: "Groups", xref: "device§9.3.5" },
        { tag: "requirement", name: "OnOff", xref: "device§9.3.5" },
        { tag: "requirement", name: "FanControl", xref: "device§9.3.5" },
        { tag: "requirement", name: "HepaFilterMonitoring", xref: "device§9.3.5" },
        { tag: "requirement", name: "ActivatedCarbonFilterMonitoring", xref: "device§9.3.5" },
        { tag: "requirement", name: "Thermostat", xref: "device§9.3.4" },
        { tag: "requirement", name: "TemperatureSensor", xref: "device§9.3.4" },
        { tag: "requirement", name: "HumiditySensor", xref: "device§9.3.4" },
        { tag: "requirement", name: "AirQualitySensor", xref: "device§9.3.4" }
    ]
});
