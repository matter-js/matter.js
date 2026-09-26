/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
        "control a heating or cooling unit directly." +
        "\n" +
        "### Thermostat Suggestion and Predicted Activity Considerations" +
        "\n" +
        "The thermostat cluster contains the Thermostat Suggestion feature, which allows clients to provide " +
        "suggestions based on external contexts. The thermostat might also support the Ambient Context " +
        "Sensing client and take action based on the context provided by the Predicted Activity feature. " +
        "Thermostats may support either of these features. If both functionalities are supported, the " +
        "following recommendations are provided to Thermostat devices:" +
        "\n" +
        "  - Changes which the thermostat wants to apply as a result of the data provided by the Ambient " +
        "Context Sensing server, SHOULD be translated into a Thermostat Suggestion and SHOULD NOT be " +
        "directly applied, in order to let the thermostat evaluate the change in state with any other " +
        "suggestion provided by other clients." +
        "\n" +
        "  - If the resulting action from the context provided by the Ambient Context Sensing client can not " +
        "be translated into a supported Thermostat Suggestion, the Thermostat may apply the change " +
        "directly, but should be aware that it might impact the evaluation of any current suggestions and " +
        "the behavior related to conflict resolution between the current suggestions and the input from " +
        "the Ambient Context Sensing client is manufacturer specific." +
        "\n" +
        "  - The thermostat may prioritize the data provided by the Ambient Context Sensing server, in case " +
        "there are multiple suggestions present, and use this as input when deciding which suggestion to " +
        "apply.",

    children: [
        { tag: "requirement", name: "GroupcastListenerCond", xref: "device§9.1.4" },
        { tag: "requirement", name: "Identify", xref: "device§9.1.5" },
        { tag: "requirement", name: "Groups", xref: "device§9.1.5" },
        { tag: "requirement", name: "EnergyPreference", xref: "device§9.1.5" },
        { tag: "requirement", name: "Thermostat", xref: "device§9.1.5" },
        { tag: "requirement", name: "FanControl", xref: "device§9.1.5" },
        { tag: "requirement", name: "ThermostatUserInterfaceConfiguration", xref: "device§9.1.5" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§9.1.5" },
        { tag: "requirement", name: "RelativeHumidityMeasurement", xref: "device§9.1.5" },
        { tag: "requirement", name: "OccupancySensing", xref: "device§9.1.5" },
        { tag: "requirement", name: "AmbientContextSensing", xref: "device§9.1.5" }
    ]
});
