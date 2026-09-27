/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ElectricalUtilityMeter", xref: "device§14.9",

    details: "An Electrical Utility Meter device provides utility account information, as well as optional details " +
        "about tariffs and metering." +
        "\n" +
        "### Electrical Utility Meter Topology" +
        "\n" +
        "#### Basic Utility Meter" +
        "\n" +
        "A basic Electrical Utility Meter device type has a simple import tariff endpoint for grid power, " +
        "tagged as Grid, Import, AC, and Current." +
        "\n" +
        "Optionally, this endpoint may have a child endpoint representing an upcoming tariff, if available, " +
        "tagged as Grid, Import, AC, and Upcoming." +
        "\n" +
        "Optionally, this endpoint may have child endpoints representing measurements of individual phases of " +
        "a polyphase power supply." +
        "\n" +
        "#### Separate EV Rate" +
        "\n" +
        "Building on the basic topology, an Electrical Utility Meter device type which has a separate rate " +
        "for EV charging would add a second endpoint, tagged as EV, Import, AC, and Current." +
        "\n" +
        "Optionally, this endpoint may have a child endpoint representing an upcoming EV tariff, if " +
        "available, tagged as EV, Import, AC, and Upcoming." +
        "\n" +
        "#### Export Rate" +
        "\n" +
        "Similarly, an Electrical Utility Meter device type which has a separate rate for exported electrical " +
        "energy would add a second endpoint, tagged as Grid, Export, AC, and Current." +
        "\n" +
        "Optionally, this endpoint may have a child endpoint representing an upcoming export tariff, if " +
        "available, tagged as Grid, Export, AC, and Upcoming." +
        "\n" +
        "#### Combination of EV and Export" +
        "\n" +
        "The above topologies can be composed to represent various combinations of tariffs. In this example, " +
        "a tariff has separate rates for an EV and for exporting energy to the grid.",

    children: [
        { tag: "requirement", name: "TimeSyncCond", xref: "device§14.9.4" },
        { tag: "requirement", name: "MeterIdentification", xref: "device§14.9.5" }
    ]
});
