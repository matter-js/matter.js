/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Aggregator", xref: "device§11.2",

    details: "This device type aggregates endpoints as a collection. Clusters on the endpoint indicating this " +
        "device type provide functionality for the collection of descendant endpoints present in the " +
        "PartsList of the endpoint’s descriptor, for example the Actions cluster." +
        "\n" +
        "The purpose of this device type is to aggregate functionality for a collection of endpoints. The " +
        "definition of the collection or functionality is not defined here." +
        "\n" +
        "When using this device type as a collection of bridged nodes, please see the \"Bridge\" section in the " +
        "System Model specification.",

    children: [
        { tag: "requirement", name: "Actions", xref: "device§11.2.4" },
        { tag: "requirement", name: "Identify", xref: "device§11.2.4" },
        { tag: "requirement", name: "CommissionerControl", xref: "device§11.2.4" },

        {
            tag: "field", name: "conditions",
            children: [{
                tag: "field", name: "FabricSynchronization", description: "See description below.",
                xref: "device§11.2.3"
            }]
        }
    ]
});
