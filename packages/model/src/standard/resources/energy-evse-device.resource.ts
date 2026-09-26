/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "EnergyEvse", xref: "device§14.1",

    details: "An EVSE (Electric Vehicle Supply Equipment) is a device that allows an EV (Electric Vehicle) to be " +
        "connected to the mains electricity supply to allow it to be charged (or discharged in case of " +
        "Vehicle to Grid / Vehicle to Home applications)." +
        "\n" +
        "### EVSE Architecture" +
        "\n" +
        "An EVSE is always defined via endpoint composition. See Section 14.1.6, \"Device Type Requirements\" " +
        "for more details." +
        "\n" +
        "An example of an EVSE with single phase AC supply is illustrated below." +
        "\n" +
        "The EVSE may also indicate its internal temperature using the temperature measurement cluster (not " +
        "shown)." +
        "\n" +
        "An example of an EVSE with a 3 phase AC supply is illustrated below." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "An EVSE shall be composed of at least one endpoint with device types as defined by the conformance " +
        "below. There may be more endpoints with other device types existing in the EVSE." +
        "\n" +
        "#### Cluster Requirements on Component Device Types" +
        "\n" +
        "The Electrical Sensor device shall include both the Electrical Energy Measurement and Electrical " +
        "Power Measurement clusters, measuring the total energy and power of the EVSE." +
        "\n" +
        "#### Element Requirements on Component Device Types" +
        "\n" +
        "If an EVSE supports three phase power then it shall include three additional endpoints including an " +
        "Electrical Sensor Device Type as child elements. For each child endpoint it shall include a semantic " +
        "tag from the Electrical Measurement Namespace in the TagList attribute of the Descriptor cluster to " +
        "describe the endpoint for the relevant Electrical Power Measurement and Electrical Energy " +
        "Measurement clusters indicating the relevant AC phase that is being measured." +
        "\n" +
        "If the EVSE supports the V2X feature then the Device Energy Management cluster included in the " +
        "Device Energy Management device shall support the PowerAdjustment (PA) feature.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§14.1.5" },
        { tag: "requirement", name: "EnergyEvse", xref: "device§14.1.5" },
        { tag: "requirement", name: "EnergyEvseMode", xref: "device§14.1.5" },
        { tag: "requirement", name: "TemperatureMeasurement", xref: "device§14.1.5" },
        { tag: "requirement", name: "PowerSource", xref: "device§14.1.6" },

        {
            tag: "requirement", name: "DeviceEnergyManagement", xref: "device§14.1.6",

            children: [{
                tag: "requirement", name: "DeviceEnergyManagement",
                children: [
                    { tag: "requirement", name: "POWERFORECASTREPORTING", xref: "device§14.1.6.2" },
                    { tag: "requirement", name: "POWERADJUSTMENT", xref: "device§14.1.6.2" }
                ]
            }]
        },

        { tag: "requirement", name: "ElectricalSensor", xref: "device§14.1.6" }
    ]
});
