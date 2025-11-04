/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "BridgedNode", xref: "device§2.5",
    details: "This defines conformance for a Bridged Node root endpoint. This endpoint is akin to a \"read me " +
        "first\" endpoint that describes itself and any other endpoints that make up the Bridged Node. A " +
        "Bridged Node endpoint represents a device on a foreign network, but is not the root endpoint of the " +
        "bridge itself.",

    children: [
        { tag: "requirement", name: "BridgedDeviceBasicInformation", xref: "device§2.5.5" },
        { tag: "requirement", name: "PowerSourceConfiguration", xref: "device§2.5.5" },
        {
            tag: "requirement", name: "PowerSource", discriminator: "BridgedPowerSourceInfo:serverCluster",
            xref: "device§2.5.5"
        },
        { tag: "requirement", name: "EcosystemInformation", xref: "device§2.5.5" },
        { tag: "requirement", name: "AdministratorCommissioning", xref: "device§2.5.5" },
        { tag: "requirement", name: "PowerSource", discriminator: "O:deviceType", xref: "device§2.5.4" },

        {
            tag: "field", name: "conditions",
            children: [{
                tag: "field", name: "FabricSynchronizedNode", description: "See description below.",
                xref: "device§2.5.3"
            }]
        }
    ]
});
