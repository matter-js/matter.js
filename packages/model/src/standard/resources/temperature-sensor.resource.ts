/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "TemperatureSensor", xref: "device§7.4",

    details: "A Temperature Sensor device reports measurements of temperature." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Thermostat User Interface Configuration Cluster" +
        "\n" +
        "This cluster provides an interface to allow configuration of the user interface for a temperature " +
        "sensor that supports keypad or screen.",

    children: [
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§7.4.4" },
        { tag: "requirement", name: "Identify", xref: "device§7.4.4" },
        {
            tag: "requirement", name: "ThermostatUserInterfaceConfiguration", xref: "device§7.4.4",
            children: [{ tag: "requirement", name: "KeypadLockout", xref: "device§7.4.5" }]
        }
    ]
});
