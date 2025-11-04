/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "SecondaryNetworkInterface", xref: "device§2.8",

    details: "A Secondary Network Interface device provides an additional network interface supported by the Node, " +
        "supplementing the primary interface hosted by the Root Node endpoint." +
        "\n" +
        "A Node supporting multiple network interfaces shall include the primary interface on the Root Node " +
        "endpoint, along with secondary interfaces on other endpoints. The priorities of these network " +
        "interfaces are determined by the order of their endpoints, where interfaces with smaller endpoint " +
        "numbers are higher priority.",

    children: [
        { tag: "requirement", name: "NetworkCommissioning", xref: "device§2.8.3" },
        { tag: "requirement", name: "EthernetNetworkDiagnostics", xref: "device§2.8.3" },
        { tag: "requirement", name: "WiFiNetworkDiagnostics", xref: "device§2.8.3" },
        { tag: "requirement", name: "ThreadNetworkDiagnostics", xref: "device§2.8.3" }
    ]
});
