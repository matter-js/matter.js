/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
        "requirements, but that cannot be used for space heating." +
        "\n" +
        "### Heat Pump Architecture" +
        "\n" +
        "A Heat Pump device is always defined via endpoint composition. See Section 14.5.6, \"Device Type " +
        "Requirements\" for more details." +
        "\n" +
        "The Heat Pump device may contain Temperature Sensors for example to measure the flow and return " +
        "temperatures of the water it is providing to the premises heating system." +
        "\n" +
        "The Heat Pump device may also include Thermostats located in the rooms that are being heated by it, " +
        "which in turn may also include Temperature Sensor clusters which can report the temperatures in " +
        "those rooms. These Thermostats may be included as servers within Thermostat devices within the Heat " +
        "Pump device itself, or may be separate third-party Thermostat devices for which the Heat Pump has a " +
        "client to use them." +
        "\n" +
        "An example of a Heat Pump device is illustrated below." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Heat Pump device shall be composed of at least one endpoint with device types as defined by the " +
        "conformance below. There may be more endpoints with additional instances of these device types or " +
        "additional device types existing in the Heat Pump device." +
        "\n" +
        "The Heat Pump device shall include either one or more Thermostat devices, or include a Thermostat " +
        "client." +
        "\n" +
        "#### Element Requirements on Component Device Types" +
        "\n" +
        "If a Heat Pump device supports two or three phase power input then it may include two or three " +
        "additional endpoints, each including an Electrical Sensor Device Type as child elements. For each " +
        "such child endpoint it shall include a semantic tag from the Electrical Measurement Namespace in the " +
        "TagList attribute of the Descriptor cluster to describe the endpoint for the relevant Electrical " +
        "Power Measurement and Electrical Energy Measurement clusters indicating the relevant AC phase that " +
        "is being measured." +
        "\n" +
        "The Electrical Energy Measurement and Electrical Power Measurement clusters of the mandatory " +
        "Electrical Sensor device shall measure the energy and power of the Heat Pump device at the AC grid " +
        "connection point." +
        "\n" +
        "The Electrical Power Measurement clusters of the mandatory Electrical Sensor device shall support " +
        "the PolyPhasePower feature if the Heat Pump device is connected via polyphase wiring." +
        "\n" +
        "The Electrical Energy Measurement cluster of the mandatory Electrical Sensor device SHOULD support " +
        "the ImportedEnergy and CumulativeEnergy features." +
        "\n" +
        "Any Temperature Sensors using non-standard Namespaces for their Tags shall include Label(s) in the " +
        "Descriptor clusters of their endpoints to identify the temperature being measured." +
        "\n" +
        "Any Thermostat shall include a semantic tag from a Common Namespace, or a Manufacturer defined Tag " +
        "and Label, in the TagList attribute of the Descriptor cluster to describe the endpoint for the " +
        "relevant Thermostat clusters, indicating the relevant device (or its connected port) that is being " +
        "measured. It shall also include a User Label cluster to allow an installer to add identifying " +
        "information for the rooms or spaces where the Thermostat measurement point is located.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.5.5" },
        { tag: "requirement", name: "Thermostat", discriminator: "O:clientCluster", xref: "device§14.5.5" },

        {
            tag: "requirement", name: "PowerSource", xref: "device§14.5.6",

            children: [
                {
                    tag: "requirement", name: "PowerSource",
                    children: [{ tag: "requirement", name: "WIRED", xref: "device§14.5.6.2" }]
                },
                {
                    tag: "requirement", name: "Descriptor",
                    children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.5.6.2" }]
                }
            ]
        },

        {
            tag: "requirement", name: "Thermostat", discriminator: "O:deviceType", xref: "device§14.5.6",
            children: [{
                tag: "requirement", name: "Descriptor",
                children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.5.6.2" }]
            }]
        },

        {
            tag: "requirement", name: "TemperatureSensor", xref: "device§14.5.6",
            children: [{
                tag: "requirement", name: "Descriptor",
                children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.5.6.2" }]
            }]
        },

        {
            tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.5.6",
            children: [{
                tag: "requirement", name: "DeviceEnergyManagement",
                children: [{ tag: "requirement", name: "POWERADJUSTMENT", xref: "device§14.5.6.2" }]
            }]
        },

        { tag: "requirement", name: "WaterHeater", xref: "device§14.5.6" },

        {
            tag: "requirement", name: "ElectricalSensor", xref: "device§14.5.6",

            children: [{
                tag: "requirement", name: "ElectricalPowerMeasurement",
                children: [
                    { tag: "requirement", name: "ALTERNATINGCURRENT", xref: "device§14.5.6.2" },
                    { tag: "requirement", name: "Voltage", xref: "device§14.5.6.2" },
                    { tag: "requirement", name: "ActiveCurrent", xref: "device§14.5.6.2" }
                ]
            }]
        }
    ]
});
