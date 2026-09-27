/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SolarPower", xref: "device§14.3",

    details: "A Solar Power device is a device that allows a solar panel array, which can optionally be comprised " +
        "of a set parallel strings of solar panels, and its associated controller and, if appropriate, " +
        "inverter, to be monitored and controlled by an Energy Management System." +
        "\n" +
        "### Solar Power Architecture" +
        "\n" +
        "A Solar Power device is always defined via endpoint composition. See Section 14.3.6, \"Device Type " +
        "Requirements\" for more details." +
        "\n" +
        "An example of a Solar Power device with single phase AC output is illustrated below." +
        "\n" +
        "An example of a Solar Power device with single phase AC output, but with the ability to measure the " +
        "output from 4 sets of solar panels supplying the overall device is illustrated below." +
        "\n" +
        "An example of a Solar Power device with single phase AC output, but with the ability to measure the " +
        "output from 4 individual solar panels, arranged as 2 strings or 2 panels each is illustrated below." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Solar Power device shall be composed of at least one endpoint with device types as defined by the " +
        "conformance below. There may be more endpoints with additional instances of these device types or " +
        "additional device types existing in the Solar Power device." +
        "\n" +
        "#### Device Energy Management Device Type" +
        "\n" +
        "If the Solar Power device output power can be controlled, then the Device Energy Management device " +
        "shall be included." +
        "\n" +
        "#### Cluster Requirements on Component Device Types" +
        "\n" +
        "If a Solar Power device supports measurement of the output of individual solar panels or strings of " +
        "solar panels then it may include additional endpoints for each such measurement, including an " +
        "Electrical Sensor Device Type as child elements. For each such child endpoint:" +
        "\n" +
        "  - It shall include a User Label cluster to allow an installer to add identifying information for " +
        "the panel or string of panels." +
        "\n" +
        "#### Element Requirements on Component Device Types" +
        "\n" +
        "The Electrical Sensor device shall also conform to the following:" +
        "\n" +
        "  - An Electrical Sensor device shall measure the energy and power flows of the Solar Power device " +
        "at the AC grid or DC connection point." +
        "\n" +
        "  - If the Solar Power device is connected to AC wiring, this Electrical Power Measurement cluster " +
        "shall support the AlternatingCurrent feature, and shall support the PolyPhasePower feature if " +
        "the Solar Power device is connected via polyphase wiring." +
        "\n" +
        "  - If the Solar Power device is connected to DC wiring, this Electrical Power Measurement cluster " +
        "shall support the DirectCurrent feature." +
        "\n" +
        "  - This Electrical Power Measurement cluster SHOULD support the ReactivePower attribute if " +
        "connected to AC wiring." +
        "\n" +
        "  - This Electrical Energy Measurement cluster SHOULD support the CumulativeEnergy feature." +
        "\n" +
        "#### Semantic Tag Requirements on Component Device Types" +
        "\n" +
        "The Descriptor cluster for the endpoint including the Power Source device shall include the Grid tag " +
        "if it is connected to the premises wiring." +
        "\n" +
        "If a Solar Power device supports two or three phase power output then it may include two or three " +
        "additional endpoints, each including an Electrical Sensor Device Type as child elements. For each " +
        "such child endpoint it shall include a semantic tag from the Electrical Measurement Namespace in the " +
        "TagList attribute of the Descriptor cluster to describe the endpoint for the relevant Electrical " +
        "Power Measurement and Electrical Energy Measurement clusters indicating the relevant AC phase that " +
        "is being measured." +
        "\n" +
        "If a Solar Power device supports measurement of the output of individual solar panels or strings of " +
        "solar panels then it may include additional endpoints for each such measurement, including an " +
        "Electrical Sensor Device Type as child elements. For each such child endpoint:" +
        "\n" +
        "  - It shall include a semantic tag from a Common Namespace, or a Manufacturer defined Tag and " +
        "Label, in the TagList attribute of the Descriptor cluster to describe the endpoint for the " +
        "relevant Electrical Power Measurement and Electrical Energy Measurement clusters, indicating the " +
        "relevant device port, panel, or string of panels that is being measured." +
        "\n" +
        "Any Temperature Sensors included shall include Tag(s), and for non-standard Namespaces, Label(s) in " +
        "the Descriptor clusters of their endpoints to identify the temperature being measured.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.3.5" },

        {
            tag: "requirement", name: "PowerSource", xref: "device§14.3.6",

            children: [
                {
                    tag: "requirement", name: "PowerSource",
                    children: [{ tag: "requirement", name: "WIRED", xref: "device§14.3.6.3" }]
                },
                {
                    tag: "requirement", name: "Descriptor",
                    children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.3.6.3" }]
                }
            ]
        },

        {
            tag: "requirement", name: "TemperatureSensor", xref: "device§14.3.6",
            children: [{
                tag: "requirement", name: "Descriptor",
                children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.3.6.3" }]
            }]
        },

        {
            tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.3.6",
            children: [{
                tag: "requirement", name: "DeviceEnergyManagement",
                children: [{ tag: "requirement", name: "POWERADJUSTMENT", xref: "device§14.3.6.3" }]
            }]
        },

        {
            tag: "requirement", name: "ElectricalSensor", xref: "device§14.3.6",

            children: [
                {
                    tag: "requirement", name: "ElectricalPowerMeasurement",
                    children: [
                        { tag: "requirement", name: "Voltage", xref: "device§14.3.6.3" },
                        { tag: "requirement", name: "ActiveCurrent", xref: "device§14.3.6.3" }
                    ]
                },

                {
                    tag: "requirement", name: "ElectricalEnergyMeasurement",
                    children: [{ tag: "requirement", name: "EXPORTEDENERGY", xref: "device§14.3.6.3" }]
                }
            ]
        }
    ]
});
