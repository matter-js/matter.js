/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "BridgedNode", xref: "device§2.5",

    details: "This defines conformance for a Bridged Node root endpoint. This endpoint is akin to a \"read me " +
        "first\" endpoint that describes itself and any other endpoints that make up the Bridged Node. A " +
        "Bridged Node endpoint represents a device on a foreign network, but is not the root endpoint of the " +
        "bridge itself." +
        "\n" +
        "### Device Type Requirements" +
        "\n" +
        "This device type shall only be indicated on endpoints which are listed in the Descriptor cluster " +
        "PartsList of another endpoint with an Aggregator device type." +
        "\n" +
        "### Endpoint Composition" +
        "\n" +
        "A Bridged Node endpoint shall support one of the following composition patterns:" +
        "\n" +
        "  - Separate Endpoints: All application device types are supported on separate descendant endpoints, " +
        "and shall NOT be hosted on the Bridged Node endpoint. The Bridged Node endpoint's Descriptor " +
        "cluster PartsList attribute shall indicate a list of all endpoints representing the " +
        "functionality of the bridged device, including the endpoints supporting the application device " +
        "types, i.e. the full-family pattern defined in the System Model specification. This is used for " +
        "the following cases:" +
        "\n" +
        "  - Exposing a compound device - the child endpoints each have a part of the functionality of the " +
        "bridged device. See endpoints 31-34 in the example below; the bridged device is a PIR sensor " +
        "which also has temperature and illuminance measurement. Endpoints 32-34 host the associated " +
        "application device types and clusters. Endpoint 31 (the endpoint with the Bridged Node device " +
        "type) functions as parent for these endpoints and has no application device types." +
        "\n" +
        "  - Exposing a composed device type - a child endpoint of the endpoint with the Bridged Node device " +
        "type has the composed device type; this endpoint with the composed device type has child " +
        "endpoints for the device type(s) that are mandatory or optional for the composed device type. " +
        "See endpoints 41-43 in the example below; this is a refrigerator, which is a composed device " +
        "type, hosted on endpoint 42, with the associated temperature controlled cabinet device type on " +
        "child endpoint 43. Endpoint 41 (the endpoint with the Bridged Node device type) functions as " +
        "parent for the endpoint hosting the composed device type and has no application clusters." +
        "\n" +
        "  - Combinations of the above." +
        "\n" +
        "  - One Endpoint: Both the Bridged Node and one or more application device types are supported on " +
        "the same endpoint (following application device type rules). The PartsList attribute in the " +
        "Descriptor cluster shall be empty. Since compound devices and composed device types each need " +
        "more than one endpoint to expose their functionality, they cannot use the \"One Endpoint\" pattern " +
        "and need to use the \"Separate Endpoints\" model described above." +
        "\n" +
        "  - Example in the figure below: endpoint 21 hosts the Bridged Node utility device type, plus the " +
        "application device type for a dimmable light on same endpoint. Since the dimmable light device " +
        "type is a superset of on/off light, that subset device type may be added here as well." +
        "\n" +
        "In all these composition patterns, endpoint composition shall conform to the application device " +
        "type(s) definition.",

    children: [
        { tag: "requirement", name: "PowerSourceConfiguration", xref: "device§2.5.5" },
        {
            tag: "requirement", name: "PowerSource", discriminator: "BridgedPowerSourceInfo:serverCluster",
            xref: "device§2.5.5"
        },
        { tag: "requirement", name: "BridgedDeviceBasicInformation", xref: "device§2.5.5" },
        { tag: "requirement", name: "AdministratorCommissioning", xref: "device§2.5.5" },
        { tag: "requirement", name: "EcosystemInformation", xref: "device§2.5.5" },
        { tag: "requirement", name: "PowerSource", discriminator: "O:deviceType", xref: "device§2.5.4" },

        {
            tag: "condition", name: "FabricSynchronizedNode", description: "See description below.",
            xref: "device§2.5.3.1",

            details: "The FabricSynchronizedNode condition applies to a Bridged Node endpoint when all of the following " +
                "are true:" +
                "\n" +
                "  - There is a Commissioner Control Cluster on an Aggregator which has this endpoint as a " +
                "descendant." +
                "\n" +
                "  - The Commissioner Control Cluster has a SupportedDeviceCategories attribute with the " +
                "FabricSynchronization bit set." +
                "\n" +
                "  - The bridged node is a Matter Node."
        }
    ]
});
