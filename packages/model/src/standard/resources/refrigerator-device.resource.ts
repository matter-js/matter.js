/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Refrigerator", xref: "device§13.2",

    details: "A refrigerator represents a device that contains one or more cabinets that are capable of chilling " +
        "or freezing food. Examples of consumer products that may make use of this device type include " +
        "refrigerators, freezers, and wine coolers." +
        "\n" +
        "### Refrigerator Architecture" +
        "\n" +
        "A Refrigerator is always defined via endpoint composition. See Section 13.2.6, \"Device Type " +
        "Requirements\" for more details." +
        "\n" +
        "A Refrigerator may include a semantic tag in the TagList attribute of the Descriptor cluster to " +
        "describe the primary function of the device, e.g., \"Refrigerator\" or \"Freezer\"." +
        "\n" +
        "An example of a Refrigerator with multiple cabinets is illustrated below." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "A Refrigerator shall be composed of at least one endpoint with the Temperature Controlled Cabinet " +
        "device type as defined by the conformance below. There may be more endpoints with other device types " +
        "existing in the Refrigerator." +
        "\n" +
        "If the Refrigerator contains more than one instance of a Temperature Controlled Cabinet, those " +
        "instances shall include a semantic tag in the TagList attribute of the Descriptor cluster to " +
        "disambiguate the cabinet, e.g., \"freezer\" or \"refrigerator\". Such a semantic tag shall be from " +
        "either the defined Common or Refrigerator namespaces." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "#### Activated Carbon Filter Monitoring Cluster" +
        "\n" +
        "This cluster is used to represent the status of a water filter, if present on the device.",

    children: [
        { tag: "requirement", name: "Cooler", xref: "device§13.2.5" },
        { tag: "requirement", name: "Identify", xref: "device§13.2.7" },

        {
            tag: "requirement", name: "RefrigeratorAndTemperatureControlledCabinetMode", xref: "device§13.2.7",
            children: [
                { tag: "requirement", name: "ONOFF", xref: "device§13.2.8" },
                { tag: "requirement", name: "StartUpMode", xref: "device§13.2.8" }
            ]
        },

        { tag: "requirement", name: "RefrigeratorAlarm", xref: "device§13.2.7" },
        { tag: "requirement", name: "ActivatedCarbonFilterMonitoring", xref: "device§13.2.7" },
        { tag: "requirement", name: "TemperatureControlledCabinet", xref: "device§13.2.6" }
    ]
});
