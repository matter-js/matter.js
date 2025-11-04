/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Thermostat", xref: "device§9.1",
    details: "A Thermostat device is capable of having either built-in or separate sensors for temperature, " +
        "humidity or occupancy. It allows the desired temperature to be set either remotely or locally. The " +
        "thermostat is capable of sending heating and/or cooling requirement notifications to a " +
        "heating/cooling unit (for example, an indoor air handler) or is capable of including a mechanism to " +
        "control a heating or cooling unit directly.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§9.1.4" },
        { tag: "requirement", name: "Groups", xref: "device§9.1.4" },
        { tag: "requirement", name: "Thermostat", xref: "device§9.1.4" },
        { tag: "requirement", name: "ThermostatUserInterfaceConfiguration", xref: "device§9.1.4" },
        { tag: "requirement", name: "EnergyPreference", xref: "device§9.1.4" },
        { tag: "requirement", name: "FanControl", xref: "device§9.1.4" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§9.1.4" },
        { tag: "requirement", name: "RelativeHumidityMeasurement", xref: "device§9.1.4" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§9.1.4" }
    ]
});
