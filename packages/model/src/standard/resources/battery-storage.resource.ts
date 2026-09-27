/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "BatteryStorage", xref: "device§14.4",

    details: "A Battery Storage device is a device that allows a DC battery, which can optionally be comprised of " +
        "a set parallel strings of battery packs and associated controller, and an AC inverter, to be " +
        "monitored and controlled by an Energy Management System in order to manage the peaks and troughs of " +
        "supply and demand, and/or to optimize cost of the energy consumed in premises. It is not intended to " +
        "be used for a UPS directly supplying a set of appliances, nor for portable battery storage devices." +
        "\n" +
        "### Battery Storage Architecture" +
        "\n" +
        "A Battery Storage device is always defined via endpoint composition. See Section 14.4.6, \"Device " +
        "Type Requirements\" for more details." +
        "\n" +
        "An example of a Battery Storage device with single phase AC output is illustrated below." +
        "\n" +
        "An example of a Battery Storage device which also includes a directly connected Solar Power device " +
        "supplying DC power to the battery and using a single common inverter to the single phase AC input " +
        "and output is illustrated below." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Battery Storage device shall be composed of at least two endpoints with device types as defined by " +
        "the conformance below. There may be more endpoints with additional instances of these device types " +
        "or additional device types existing in the Battery Storage device." +
        "\n" +
        "The Solar Power devices, if included, shall have separate endpoints, and include their own Power " +
        "Source, Electrical Sensor, and Device Energy Management devices, as defined by the Solar Power " +
        "device." +
        "\n" +
        "#### Cluster Requirements on Component Device Types" +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> NOTE: The use of 1st and 2nd to annotate the device types is purely to distinguish the two from " +
        "each other. It does NOT specify any order or structure of the composition." +
        "\n" +
        "#### Element Requirements on Component Device Types" +
        "\n" +
        "The Power Source cluster in the Power Source device shall support the RECHG feature if it can be " +
        "charged as well as discharged through the connection to the premises wiring." +
        "\n" +
        "The Electrical Sensor device shall also conform to the following:" +
        "\n" +
        "  - An Electrical Sensor device shall measure the energy and power flows of the Battery Storage " +
        "device at the AC grid connection point." +
        "\n" +
        "  - The Electrical Power Measurement cluster of this Electrical Sensor device shall support the " +
        "PolyphasePower feature if the Battery Storage device is connected via polyphase wiring, and " +
        "SHOULD support the ReactivePower attribute." +
        "\n" +
        "  - The Electrical Energy Measurement cluster of this Electrical Sensor device shall support the " +
        "ImportedEnergy feature if it can be charged as well as discharged through the connection to the " +
        "premises wiring, and SHOULD support the CumulativeEnergy feature." +
        "\n" +
        "If a Battery Storage device supports two or three phase power output then it may include two or " +
        "three additional endpoints, each including an Electrical Sensor Device Type as child elements. For " +
        "each such child endpoint it shall include a semantic tag from the Electrical Measurement Namespace " +
        "in the TagList attribute of the Descriptor cluster to describe the endpoint for the relevant " +
        "Electrical Power Measurement and Electrical Energy Measurement clusters indicating the relevant AC " +
        "phase that is being measured." +
        "\n" +
        "If a Battery Storage device supports measurement of the input and output of individual batteries or " +
        "sets of batteries then it may include additional endpoints for each such measurement, including an " +
        "Electrical Sensor Device Type as child elements. For each such child endpoint: it shall include a " +
        "semantic tag from the Common Number Namespace, or a Manufacturer defined Tag and Label, in the " +
        "TagList attribute of the Descriptor cluster to describe the endpoint for the relevant Electrical " +
        "Power Measurement and Electrical Energy Measurement clusters indicating the relevant device port, " +
        "battery, or set of batteries that is being measured. it SHOULD also include a User Label cluster to " +
        "allow an installer to add identifying information if the device permits flexible connection of the " +
        "actual batteries at installation time." +
        "\n" +
        "Any Temperature Sensors included shall include Tag(s), and for non-standard Namespaces, Label(s) in " +
        "the Descriptor clusters of their endpoints to identify the temperature being measured.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.4.5" },

        {
            tag: "requirement", name: "ElectricalSensor", discriminator: "M:deviceType",

            children: [
                {
                    tag: "requirement", name: "ElectricalPowerMeasurement",
                    children: [
                        { tag: "requirement", name: "ALTERNATINGCURRENT", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "Voltage", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "ActiveCurrent", xref: "device§14.4.6.2" }
                    ]
                },

                {
                    tag: "requirement", name: "ElectricalEnergyMeasurement",
                    children: [{ tag: "requirement", name: "EXPORTEDENERGY", xref: "device§14.4.6.2" }]
                },
                {
                    tag: "requirement", name: "Descriptor",
                    children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.4.6.2" }]
                }
            ]
        },

        {
            tag: "requirement", name: "ElectricalSensor", discriminator: "M:deviceType",

            children: [
                {
                    tag: "requirement", name: "ElectricalPowerMeasurement",
                    children: [
                        { tag: "requirement", name: "DIRECTCURRENT", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "Voltage", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "ActiveCurrent", xref: "device§14.4.6.2" }
                    ]
                },

                {
                    tag: "requirement", name: "ElectricalEnergyMeasurement",
                    children: [{ tag: "requirement", name: "EXPORTEDENERGY", xref: "device§14.4.6.2" }]
                },
                {
                    tag: "requirement", name: "Descriptor",
                    children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.4.6.2" }]
                }
            ]
        },

        {
            tag: "requirement", name: "PowerSource", discriminator: "M:deviceType",

            children: [
                {
                    tag: "requirement", name: "Descriptor",
                    children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.4.6.2" }]
                },
                {
                    tag: "requirement", name: "PowerSource",
                    children: [{ tag: "requirement", name: "WIRED", xref: "device§14.4.6.2" }]
                }
            ]
        },

        {
            tag: "requirement", name: "PowerSource", discriminator: "M:deviceType",

            children: [
                {
                    tag: "requirement", name: "Descriptor",
                    children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.4.6.2" }]
                },

                {
                    tag: "requirement", name: "PowerSource",

                    children: [
                        { tag: "requirement", name: "BATTERY", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "BatVoltage", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "BatPercentRemaining", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "BatTimeRemaining", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "ActiveBatFaults", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "BatCapacity", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "BatTimeToFullCharge", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "BatChargingCurrent", xref: "device§14.4.6.2" },
                        { tag: "requirement", name: "ActiveBatChargeFaults", xref: "device§14.4.6.2" }
                    ]
                }
            ]
        },

        { tag: "requirement", name: "SolarPower", xref: "device§14.4.6" },

        {
            tag: "requirement", name: "TemperatureSensor", xref: "device§14.4.6",
            children: [{
                tag: "requirement", name: "Descriptor",
                children: [{ tag: "requirement", name: "TAGLIST", xref: "device§14.4.6.2" }]
            }]
        },

        {
            tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.4.6",
            children: [{
                tag: "requirement", name: "DeviceEnergyManagement",
                children: [{ tag: "requirement", name: "POWERADJUSTMENT", xref: "device§14.4.6.2" }]
            }]
        }
    ]
});
