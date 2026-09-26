/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Aggregator", xref: "device§11.2",

    details: "This device type aggregates endpoints as a collection. Clusters on the endpoint indicating this " +
        "device type provide functionality for the collection of descendant endpoints present in the " +
        "PartsList of the endpoint's descriptor, for example the Actions cluster." +
        "\n" +
        "The purpose of this device type is to aggregate functionality for a collection of endpoints. The " +
        "definition of the collection or functionality is not defined here." +
        "\n" +
        "When using this device type as a collection of bridged nodes, please see the \"Bridge\" section in the " +
        "System Model specification." +
        "\n" +
        "### Cluster Requirements" +
        "\n" +
        "The Identify cluster SHOULD be used in case this device type is used to represent a Bridge which has " +
        "a mechanism to identify itself to the user (e.g. blinking LED on the bridge itself)." +
        "\n" +
        "For the Identify-functionality of the individual bridged devices, see the Identify cluster on the " +
        "endpoint for a bridged device." +
        "\n" +
        "### Endpoint Composition" +
        "\n" +
        "An Aggregator endpoint's Descriptor cluster PartsList attribute shall list the collection of all " +
        "endpoints aggregated by the Aggregator device type, i.e. the full-family pattern defined in the " +
        "System Model specification." +
        "\n" +
        "#### Multiple aggregators" +
        "\n" +
        "When a Node has multiple instances of the Aggregator device type, the composition shall comply with " +
        "one of the following two patterns for any given pair (A,B) of endpoints with the Aggregator device " +
        "type:" +
        "\n" +
        "  - No overlap: The endpoints in the PartsList attribute of Aggregator A do not appear in the " +
        "PartsList attribute of Aggregator B, and vice versa." +
        "\n" +
        "  - Example: A Node which bridges to two non-Matter independent technologies (e.g. Zigbee and " +
        "Z-Wave), see the aggregators on endpoints 11 and 31 in the figure below - their lists of " +
        "endpoints (12-14, 21-23 versus 32-33) do not overlap." +
        "\n" +
        "  - Strict subset: The endpoint where aggregator B is exposed and all endpoints in its PartsList " +
        "attribute (the subset) are included in the PartsList attribute of Aggregator A (the superset)." +
        "\n" +
        "  - This maintains the rule that there shall be a single path from the Root Node to each endpoint " +
        "(see System Model)." +
        "\n" +
        "  - Example: A Node which implements a bridge to Zigbee, and one of those Zigbee devices is " +
        "connected to a string of DALI lights, which can be addressed individually and thus this " +
        "Zigbee/DALI device functions as a bridge from Zigbee to DALI; in the figure below one can see " +
        "that the endpoints for the Zigbee/DALI bridge listed in the PartsList of the aggregator on " +
        "endpoint 14 (21-23) form a strict subset of the endpoints for the Zigbee bridge in the PartsList " +
        "of the aggregator on endpoint 11 (12-14, 21-23), and the endpoint 14 of the \"subset\" aggregator " +
        "is included in the PartsList of the \"superset\" aggregator on endpoint 11." +
        "\n" +
        "### Disambiguation" +
        "\n" +
        "If the Duplicate condition applies to child endpoints of an Aggregator endpoint that represent " +
        "multiple independent bridged devices, the endpoints SHOULD make available metadata to allow a client " +
        "to disambiguate distinct bridged devices with an overlap in application device types." +
        "\n" +
        "Typically this is done using the NodeLabel attribute of the Bridged Device Basic Information cluster " +
        "- thus reusing the naming information which the bridge already has to allow disambiguation to the " +
        "user when using a direct user interface to the bridge." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> Example: the Aggregator in this figure (copied from the \"Bridge for non-Matter devices\" section in " +
        "the Core Specification) exposes several Color Temperature Lights (endpoints 13 and 22) which are " +
        "disambiguated with their NodeLabel. Note that the compound device at endpoints 24, 25 and 26 also " +
        "uses a TagList (for information rather than disambiguation) since, for this case, the bridge knows " +
        "the lighting direction of both elements of the compound device.",

    children: [
        { tag: "requirement", name: "Actions", xref: "device§11.2.4" },
        { tag: "requirement", name: "Identify", xref: "device§11.2.4" },
        { tag: "requirement", name: "CommissionerControl", xref: "device§11.2.4" },

        {
            tag: "condition", name: "FabricSynchronization", description: "See description below.",
            xref: "device§11.2.3.1",
            details: "The FabricSynchronization condition applies when there is a Commissioner Control Cluster on this " +
                "endpoint with a SupportedDeviceCategories attribute with the FabricSynchronization bit set."
        }
    ]
});
