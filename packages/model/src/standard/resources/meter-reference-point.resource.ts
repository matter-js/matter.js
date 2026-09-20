/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "MeterReferencePoint", xref: "device§14.6",

    details: "A Meter Reference Point device provides details about tariffs and metering." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Meter Reference Point is composed of other endpoints with device types listed in this table, " +
        "subject to the conformance column of the table. Additional device types not listed in this table may " +
        "also be included in device compositions." +
        "\n" +
        "### Meter Reference Point Topology" +
        "\n" +
        "#### Basic Electrical Meter Reference Point" +
        "\n" +
        "A basic electrical Meter Reference Point device type has a simple import tariff endpoint for grid " +
        "power, tagged as Grid, Import, AC, and Current." +
        "\n" +
        "Optionally, this endpoint may have a child endpoint representing an upcoming tariff, if available, " +
        "tagged as Grid, Import, AC, and Upcoming." +
        "\n" +
        "Optionally, the tariff endpoint may have child endpoints representing tariffs for individual phases " +
        "of a polyphase power supply." +
        "\n" +
        "#### Separate EV Rate" +
        "\n" +
        "Building on the basic topology, a Meter Reference Point device type which has a separate rate for EV " +
        "charging would add a second endpoint, tagged as EV, Import, AC, and Current." +
        "\n" +
        "Optionally, this endpoint may have a child endpoint representing an upcoming EV tariff, if " +
        "available, tagged as EV, Import, AC, and Upcoming." +
        "\n" +
        "#### Export Rate" +
        "\n" +
        "Similarly, a Meter Reference Point device type which has a separate rate for exported electrical " +
        "energy would add a second endpoint, tagged as Grid, Export, AC, and Current." +
        "\n" +
        "Optionally, this endpoint may have a child endpoint representing an upcoming export tariff, if " +
        "available, tagged as Grid, Export, AC, and Upcoming." +
        "\n" +
        "#### Combination of EV and Export" +
        "\n" +
        "The above topologies can be composed to represent various combinations of tariffs. In this example, " +
        "a tariff has separate rates for an EV and for exporting energy to the grid." +
        "\n" +
        "#### Inclusion of Metering Data" +
        "\n" +
        "Instead of Electrical Energy Tariff endpoints, a Meter Reference Point may use endpoints with the " +
        "Electrical Meter device type to represent tariffs with associated metering data.",

    children: [
        { tag: "requirement", name: "TimeSyncCond", xref: "device§14.6.4" },
        { tag: "requirement", name: "Identify", xref: "device§14.6.5" },

        {
            tag: "requirement", name: "ElectricalEnergyTariff", xref: "device§14.6.6",
            children: [{
                tag: "requirement", name: "CommodityTariff",
                children: [{ tag: "requirement", name: "TariffUnit", xref: "device§14.6.6.1" }]
            }]
        },

        { tag: "requirement", name: "ElectricalMeter", xref: "device§14.6.6" },

        {
            tag: "condition", name: "ElectricalEnergy", description: "See description below.",
            xref: "device§14.6.3.1",
            details: "The ElectricalEnergy condition applies to a Meter Reference Point representing a tariff for " +
                "electrical energy."
        }
    ]
});
