/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RootNode", classification: "node", xref: "device§2.1",

    details: "This defines conformance for a root node endpoint (see System Model specification). This endpoint is " +
        "akin to a \"read me first\" endpoint that describes itself and the other endpoints that make up the " +
        "node." +
        "\n" +
        "  • Device types with Endpoint scope shall NOT be supported on the same endpoint as this device " +
        "    type." +
        "\n" +
        "  • Clusters with an Application role shall NOT be supported on the same endpoint as this device " +
        "    type." +
        "\n" +
        "  • Other device types with Node scope may be supported on the same endpoint as this device type.",

    children: [
        { tag: "requirement", name: "BasicInformation", xref: "device§2.1.5" },
        { tag: "requirement", name: "AccessControl", xref: "device§2.1.5" },
        { tag: "requirement", name: "PowerSourceConfiguration", xref: "device§2.1.5" },
        { tag: "requirement", name: "TimeSynchronization", xref: "device§2.1.5" },
        { tag: "requirement", name: "GroupKeyManagement", xref: "device§2.1.5" },
        { tag: "requirement", name: "GeneralCommissioning", xref: "device§2.1.5" },
        { tag: "requirement", name: "NetworkCommissioning", xref: "device§2.1.5" },
        { tag: "requirement", name: "AdministratorCommissioning", xref: "device§2.1.5" },
        { tag: "requirement", name: "OperationalCredentials", xref: "device§2.1.5" },
        { tag: "requirement", name: "LocalizationConfiguration", xref: "device§2.1.5" },
        { tag: "requirement", name: "TimeFormatLocalization", xref: "device§2.1.5" },
        { tag: "requirement", name: "UnitLocalization", xref: "device§2.1.5" },
        { tag: "requirement", name: "GeneralDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "DiagnosticLogs", xref: "device§2.1.5" },
        { tag: "requirement", name: "SoftwareDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "EthernetNetworkDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "WiFiNetworkDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§2.1.5" },
        { tag: "requirement", name: "IcdManagement", xref: "device§2.1.5" },
        { tag: "requirement", name: "PowerSource", xref: "device§2.1.4" },

        {
            tag: "field", name: "conditions",

            children: [
                {
                    tag: "field", name: "CustomNetworkConfig",
                    description: "The node only supports out-of-band-configured networking (e.g. rich user interface, manufacturer-specific means, custom commissioning flows, or future IP-compliant network technology not yet directly supported by NetworkCommissioning cluster).",
                    xref: "device§2.1.3"
                },
                {
                    tag: "field", name: "ManagedAclAllowed",
                    description: "The node has at least one endpoint where some Device Type present on the endpoint has a Device Library element requirement table entry that sets this condition to true.",
                    xref: "device§2.1.3"
                }
            ]
        }
    ]
});
